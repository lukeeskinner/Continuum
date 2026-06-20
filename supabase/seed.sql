-- Continuum — demo seed data.
--
-- Applied automatically by `supabase db reset` (LOCAL only). For a remote
-- project run this file manually (SQL editor / psql) — `supabase db push` does
-- NOT run seeds. See supabase/README.md.
--
-- Embeddings are zero-vectors here (the observation pipeline writes real
-- embeddings at runtime), so similarity-based features (connection-detect /
-- query-synthesize) won't be meaningful on seed rows — but the graph itself
-- (15 nodes + the 3 hand-authored edges below) renders correctly via
-- cluster-graph. All inserts are idempotent.

-- ---------------------------------------------------------------------------
-- Demo cluster
-- ---------------------------------------------------------------------------
INSERT INTO public.clusters (id, name)
VALUES ('a904128f-7c42-4f32-bb9a-a82fca92cf3d', 'Demo Workspace')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Teammates
--
-- profiles.id references auth.users(id), so the auth users are seeded first.
-- The on_auth_user_created trigger (migration 0001) auto-creates a matching
-- profile from raw_user_meta_data; we also upsert profiles below so the seed
-- still works if that trigger is ever disabled.
--
--   Kunj   — AI layer   (admin)
--   Luke   — frontend   (member)
--   Abrham — desktop     (member)
--
-- These are demo users with no password (encrypted_password = ''); sign in via
-- magic link or the Studio Auth UI if you need to authenticate as one.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'kunj@continuum.dev', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Kunj"}',
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'luke@continuum.dev', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Luke"}',
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'abrham@continuum.dev', '',
   now(), now(), now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Abrham"}',
   '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Robustness: ensure profiles exist even if the auth trigger is absent.
INSERT INTO public.profiles (id, email, full_name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'kunj@continuum.dev',   'Kunj'),
  ('22222222-2222-2222-2222-222222222222', 'luke@continuum.dev',   'Luke'),
  ('33333333-3333-3333-3333-333333333333', 'abrham@continuum.dev', 'Abrham')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Cluster membership
-- ---------------------------------------------------------------------------
INSERT INTO public.cluster_members (cluster_id, user_id, role) VALUES
  ('a904128f-7c42-4f32-bb9a-a82fca92cf3d', '11111111-1111-1111-1111-111111111111', 'admin'),
  ('a904128f-7c42-4f32-bb9a-a82fca92cf3d', '22222222-2222-2222-2222-222222222222', 'member'),
  ('a904128f-7c42-4f32-bb9a-a82fca92cf3d', '33333333-3333-3333-3333-333333333333', 'member')
ON CONFLICT (cluster_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Semantic nodes (15) — transformer attention / retrieval-head failure /
-- long-context windows. The zero-vector embedding expression is written once in
-- the SELECT and reused for every row (see header note).
-- ---------------------------------------------------------------------------
INSERT INTO public.semantic_nodes
  (id, user_id, cluster_id, app, topic, concept, error_type, raw_descriptor, embedding, created_at)
SELECT
  v.id, v.user_id, 'a904128f-7c42-4f32-bb9a-a82fca92cf3d'::uuid,
  v.app, v.topic, v.concept, v.error_type, v.raw_descriptor,
  ('[' || array_to_string(array_fill(0, ARRAY[1536]), ',') || ']')::vector,
  v.created_at
FROM (VALUES
  -- Kunj — AI layer
  ('a0000000-0000-0000-0000-000000000001'::uuid, '11111111-1111-1111-1111-111111111111'::uuid,
   'Cursor', 'Transformer attention',
   'Implementing multi-head self-attention; scaling QK^T by sqrt(d_k) before softmax',
   NULL,
   '{"app":"Cursor","topic":"Transformer attention","concept":"multi-head self-attention scaling","error_type":null}',
   now() - interval '55 minutes'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, '11111111-1111-1111-1111-111111111111'::uuid,
   'arXiv', 'Retrieval heads',
   'Reading "Retrieval Head Mechanistically Explains Long-Context Factuality"',
   NULL,
   '{"app":"arXiv","topic":"Retrieval heads","concept":"retrieval heads drive long-context recall","error_type":null}',
   now() - interval '50 minutes'),
  ('a0000000-0000-0000-0000-000000000003'::uuid, '11111111-1111-1111-1111-111111111111'::uuid,
   'Cursor', 'Retrieval head failure',
   'Ablating retrieval heads collapses long-context recall on the eval set',
   'AttentionMaskMismatch',
   '{"app":"Cursor","topic":"Retrieval head failure","concept":"ablating retrieval heads breaks recall","error_type":"AttentionMaskMismatch"}',
   now() - interval '45 minutes'),
  ('a0000000-0000-0000-0000-000000000004'::uuid, '11111111-1111-1111-1111-111111111111'::uuid,
   'Notion', 'Long-context windows',
   'Notes on RoPE positional interpolation for stable 128k-token context',
   NULL,
   '{"app":"Notion","topic":"Long-context windows","concept":"RoPE scaling for 128k context","error_type":null}',
   now() - interval '40 minutes'),
  ('a0000000-0000-0000-0000-000000000005'::uuid, '11111111-1111-1111-1111-111111111111'::uuid,
   'Terminal', 'Attention profiling',
   'Profiling FlashAttention-2 kernels at 32k sequence length',
   NULL,
   '{"app":"Terminal","topic":"Attention profiling","concept":"FlashAttention-2 at 32k","error_type":null}',
   now() - interval '38 minutes'),
  -- Luke — frontend
  ('a0000000-0000-0000-0000-000000000006'::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
   'VS Code', 'Attention visualization',
   'Building a D3 force graph to visualize attention weights between tokens',
   NULL,
   '{"app":"VS Code","topic":"Attention visualization","concept":"D3 force graph of attention weights","error_type":null}',
   now() - interval '35 minutes'),
  ('a0000000-0000-0000-0000-000000000007'::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
   'Figma', 'Graph UI',
   'Designing node and edge styling for the knowledge-graph view',
   NULL,
   '{"app":"Figma","topic":"Graph UI","concept":"node/edge styling for graph view","error_type":null}',
   now() - interval '32 minutes'),
  ('a0000000-0000-0000-0000-000000000008'::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
   'Chrome', 'Retrieval heads',
   'Reading BertViz docs to render head-level attention maps in the UI',
   NULL,
   '{"app":"Chrome","topic":"Retrieval heads","concept":"BertViz head-level attention maps","error_type":null}',
   now() - interval '30 minutes'),
  ('a0000000-0000-0000-0000-000000000009'::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
   'VS Code', 'Long-context windows',
   'Paginating 100k-token transcripts in the timeline component',
   'RangeError: Invalid array length',
   '{"app":"VS Code","topic":"Long-context windows","concept":"paginating 100k-token transcripts","error_type":"RangeError: Invalid array length"}',
   now() - interval '28 minutes'),
  ('a0000000-0000-0000-0000-000000000010'::uuid, '22222222-2222-2222-2222-222222222222'::uuid,
   'VS Code', 'Attention visualization',
   'Color-encoding edge weights by cosine similarity in the D3 graph',
   NULL,
   '{"app":"VS Code","topic":"Attention visualization","concept":"color-encode edges by cosine similarity","error_type":null}',
   now() - interval '25 minutes'),
  -- Abrham — desktop
  ('a0000000-0000-0000-0000-000000000011'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
   'Electron', 'Long-context windows',
   'Buffering long screen-capture context windows before agent-sync',
   NULL,
   '{"app":"Electron","topic":"Long-context windows","concept":"buffer long capture windows before sync","error_type":null}',
   now() - interval '22 minutes'),
  ('a0000000-0000-0000-0000-000000000012'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
   'Xcode', 'Screen capture',
   'Sampling frames and extracting on-screen text into semantic nodes',
   NULL,
   '{"app":"Xcode","topic":"Screen capture","concept":"frame sampling + OCR to semantic nodes","error_type":null}',
   now() - interval '20 minutes'),
  ('a0000000-0000-0000-0000-000000000013'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
   'Electron', 'Retrieval head failure',
   'Events dropped when the captured context window exceeds 128k tokens',
   'ContextOverflow',
   '{"app":"Electron","topic":"Retrieval head failure","concept":"dropped events past 128k tokens","error_type":"ContextOverflow"}',
   now() - interval '16 minutes'),
  ('a0000000-0000-0000-0000-000000000014'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
   'Terminal', 'Attention profiling',
   'Measuring local embedding latency before the agent-sync upload',
   NULL,
   '{"app":"Terminal","topic":"Attention profiling","concept":"local embedding latency before upload","error_type":null}',
   now() - interval '12 minutes'),
  ('a0000000-0000-0000-0000-000000000015'::uuid, '33333333-3333-3333-3333-333333333333'::uuid,
   'Electron', 'Transformer attention',
   'Prototyping on-device attention over recent screen events',
   NULL,
   '{"app":"Electron","topic":"Transformer attention","concept":"on-device attention over screen events","error_type":null}',
   now() - interval '8 minutes')
) AS v(id, user_id, app, topic, concept, error_type, raw_descriptor, created_at)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Semantic edges (3) — cross-person connections (RELATED_TO + BUILDS_ON).
-- ---------------------------------------------------------------------------
INSERT INTO public.semantic_edges
  (id, cluster_id, source_node_id, target_node_id, type, explanation, similarity)
VALUES
  ('e0000000-0000-0000-0000-000000000001'::uuid, 'a904128f-7c42-4f32-bb9a-a82fca92cf3d'::uuid,
   'a0000000-0000-0000-0000-000000000002'::uuid, 'a0000000-0000-0000-0000-000000000008'::uuid,
   'RELATED_TO',
   'Kunj is studying retrieval heads from the mechanistic paper while Luke renders head-level attention maps — same concept, different surface.',
   0.88),
  ('e0000000-0000-0000-0000-000000000002'::uuid, 'a904128f-7c42-4f32-bb9a-a82fca92cf3d'::uuid,
   'a0000000-0000-0000-0000-000000000006'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid,
   'BUILDS_ON',
   'Luke''s D3 attention visualization builds directly on Kunj''s multi-head self-attention implementation.',
   0.85),
  ('e0000000-0000-0000-0000-000000000003'::uuid, 'a904128f-7c42-4f32-bb9a-a82fca92cf3d'::uuid,
   'a0000000-0000-0000-0000-000000000004'::uuid, 'a0000000-0000-0000-0000-000000000011'::uuid,
   'RELATED_TO',
   'Kunj''s RoPE long-context research lines up with Abrham''s desktop context-window buffering.',
   0.86)
ON CONFLICT (source_node_id, target_node_id) DO NOTHING;
