-- 0006_embed_provenance — record which model/text produced each node's vector,
-- so embeddings can be audited and reindexed if the embedding model changes.
-- Also supports graceful degradation: agent-sync writes embed_model = 'none'
-- (with a zero vector) when the embedding provider is unavailable, leaving the
-- node keyword-searchable instead of dropping it.
ALTER TABLE public.semantic_nodes
  ADD COLUMN IF NOT EXISTS embed_model TEXT,
  ADD COLUMN IF NOT EXISTS embed_text TEXT;
