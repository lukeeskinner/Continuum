-- 0004_realtime — stream new graph activity to subscribed clients.
--
-- The web dashboard animates new nodes/edges over Redis pub/sub + SSE, but the
-- desktop agent has no Redis access. Instead it subscribes to Postgres changes
-- directly through Supabase Realtime so the ambient overlay can reflect what
-- teammates are surfacing in real time.
--
-- Realtime evaluates the table's RLS policies per subscriber, so the existing
-- "members can access rows in their clusters" policies already scope each
-- client to its own cluster. REPLICA IDENTITY FULL is required so Realtime can
-- (a) see cluster_id for the `cluster_id=eq.<id>` subscription filter and
-- (b) run those RLS checks against the changed row.

alter table public.semantic_nodes replica identity full;
alter table public.semantic_edges replica identity full;

-- Add the graph tables to the realtime publication (idempotent — skip if the
-- table is already a member, e.g. on a project where it was added manually).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'semantic_nodes'
  ) then
    alter publication supabase_realtime add table public.semantic_nodes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'semantic_edges'
  ) then
    alter publication supabase_realtime add table public.semantic_edges;
  end if;
end $$;
