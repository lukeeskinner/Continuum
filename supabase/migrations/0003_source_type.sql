-- 0003_source_type — distinguish how a semantic node was captured.
-- SCREEN  : moondream2 desktop observation (default)
-- BROWSER : Browserbase enrichment of a URL
-- VOICE   : voice-captured note
-- MANUAL  : manually added
alter table public.semantic_nodes
  add column if not exists source_type text not null default 'SCREEN'
  check (source_type in ('SCREEN', 'BROWSER', 'VOICE', 'MANUAL'));
