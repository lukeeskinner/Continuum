-- Continuum v1.0 — RPC helpers + scheduled connection detection
--
-- These functions back the pgvector fallback path (when Redis VSS is offline)
-- and wire up the `connection-detect` cron job.

-- ---------------------------------------------------------------------------
-- match_nodes: cosine-similarity KNN over semantic_nodes (pgvector fallback).
-- Mirrors the Redis FT.SEARCH KNN query used on the hot path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_nodes(
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
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM public.semantic_nodes n
  WHERE n.cluster_id = target_cluster
    AND (exclude_user IS NULL OR n.user_id <> exclude_user)
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ---------------------------------------------------------------------------
-- find_connection_candidates: surface cross-person node pairs in a cluster
-- whose cosine similarity exceeds a threshold. Drives `connection-detect`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_connection_candidates(
  target_cluster UUID,
  threshold DOUBLE PRECISION DEFAULT 0.82,
  max_pairs INT DEFAULT 50
)
RETURNS TABLE (
  source_id UUID,
  target_id UUID,
  source_concept TEXT,
  target_concept TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    a.id AS source_id,
    b.id AS target_id,
    a.concept AS source_concept,
    b.concept AS target_concept,
    1 - (a.embedding <=> b.embedding) AS similarity
  FROM public.semantic_nodes a
  JOIN public.semantic_nodes b
    ON a.cluster_id = b.cluster_id
   AND a.user_id <> b.user_id      -- cross-person only
   AND a.id < b.id                 -- dedupe ordered pairs
  WHERE a.cluster_id = target_cluster
    AND (1 - (a.embedding <=> b.embedding)) > threshold
    AND NOT EXISTS (
      SELECT 1 FROM public.semantic_edges e
      WHERE (e.source_node_id = a.id AND e.target_node_id = b.id)
         OR (e.source_node_id = b.id AND e.target_node_id = a.id)
    )
  ORDER BY similarity DESC
  LIMIT max_pairs;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled connection detection (every 5 minutes).
--
-- The job invokes the `connection-detect` Edge Function via pg_net. Both the
-- function base URL and the cron bearer secret are read from Supabase Vault at
-- run time, so nothing environment-specific is hardcoded here. Before this job
-- can fire, store the two secrets once per project:
--
--   select vault.create_secret(
--     'https://<PROJECT_REF>.supabase.co/functions/v1', 'continuum_functions_url');
--   select vault.create_secret('<CRON_SECRET>', 'continuum_cron_secret');
--
-- The block below is guarded: it only runs where pg_cron + pg_net are
-- available (Supabase, and the supabase/postgres local image), and is a no-op
-- on vanilla Postgres so the migration stays portable.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN

    CREATE EXTENSION IF NOT EXISTS pg_cron;
    CREATE EXTENSION IF NOT EXISTS pg_net;

    -- Make this migration idempotent: drop a prior job before rescheduling.
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'continuum-connection-detect') THEN
      PERFORM cron.unschedule('continuum-connection-detect');
    END IF;

    PERFORM cron.schedule(
      'continuum-connection-detect',
      '*/5 * * * *',
      $job$
      SELECT net.http_post(
        url := (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'continuum_functions_url'
        ) || '/connection-detect',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'continuum_cron_secret'
          )
        ),
        body := '{}'::jsonb
      );
      $job$
    );
  END IF;
END $$;
