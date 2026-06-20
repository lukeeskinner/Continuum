-- Continuum — local development seed data.
-- Run automatically by `supabase db reset`. Embeddings are zero-vectors here;
-- the observation pipeline writes real embeddings at runtime.

-- A demo cluster.
INSERT INTO public.clusters (id, name)
VALUES ('a904128f-7c42-4f32-bb9a-a82fca92cf3d', 'Demo Workspace')
ON CONFLICT (id) DO NOTHING;

-- NOTE: profiles are created via the auth.users trigger, so seeding members
-- requires real auth users. Create them through the Supabase Auth API / Studio
-- and then insert cluster_members rows, e.g.:
--
-- INSERT INTO public.cluster_members (cluster_id, user_id, role)
-- VALUES ('a904128f-7c42-4f32-bb9a-a82fca92cf3d', '<auth-user-uuid>', 'admin');
