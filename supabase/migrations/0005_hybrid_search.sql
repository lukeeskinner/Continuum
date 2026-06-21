-- 0005_hybrid_search — add a Postgres full-text branch for hybrid retrieval
-- (vector + keyword fusion) and expose created_at from match_nodes so the
-- query path can apply recency-decay reranking.

-- ---------------------------------------------------------------------------
-- Full-text search vector over the human-readable descriptor fields.
-- GENERATED + STORED so it stays in sync with no application code; GIN-indexed.
-- (to_tsvector with a literal config is IMMUTABLE, so it's valid in a generated
-- column.)
-- ---------------------------------------------------------------------------
ALTER TABLE public.semantic_nodes
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce(app, '') || ' ' ||
      coalesce(topic, '') || ' ' ||
      coalesce(concept, '') || ' ' ||
      coalesce(error_type, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS semantic_nodes_search_tsv_idx
  ON public.semantic_nodes USING GIN (search_tsv);

-- ---------------------------------------------------------------------------
-- keyword_match_nodes: ranked lexical matches within a cluster. Mirrors the
-- shape of match_nodes so the vector and keyword branches fuse uniformly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.keyword_match_nodes(
  query_text TEXT,
  target_cluster UUID,
  match_count INT DEFAULT 20,
  exclude_user UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  app TEXT,
  topic TEXT,
  concept TEXT,
  error_type TEXT,
  created_at TIMESTAMPTZ,
  rank DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    n.id,
    n.user_id,
    n.app,
    n.topic,
    n.concept,
    n.error_type,
    n.created_at,
    ts_rank(n.search_tsv, websearch_to_tsquery('english', query_text)) AS rank
  FROM public.semantic_nodes n
  WHERE n.cluster_id = target_cluster
    AND (exclude_user IS NULL OR n.user_id <> exclude_user)
    AND n.search_tsv @@ websearch_to_tsquery('english', query_text)
  ORDER BY rank DESC
  LIMIT match_count;
$$;

-- ---------------------------------------------------------------------------
-- Recreate match_nodes to also return created_at (recency-decay needs it).
-- CREATE OR REPLACE can't change the return type, so drop first.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.match_nodes(VECTOR(1536), UUID, INT, UUID);

CREATE FUNCTION public.match_nodes(
  query_embedding VECTOR(1536),
  target_cluster UUID,
  match_count INT DEFAULT 20,
  exclude_user UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  app TEXT,
  topic TEXT,
  concept TEXT,
  error_type TEXT,
  created_at TIMESTAMPTZ,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    n.id,
    n.user_id,
    n.app,
    n.topic,
    n.concept,
    n.error_type,
    n.created_at,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM public.semantic_nodes n
  WHERE n.cluster_id = target_cluster
    AND (exclude_user IS NULL OR n.user_id <> exclude_user)
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
$$;
