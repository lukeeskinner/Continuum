-- Continuum v1.0 — Initial schema
-- Real-time, cross-person organizational knowledge graph.
--
-- This migration creates the core relational model (profiles, clusters,
-- membership, semantic nodes/edges, invites), enables pgvector for embedding
-- storage + fallback similarity scans, and sets up Row Level Security so that
-- all shared-workspace data is isolated per cluster.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
-- Vector extension for fallback / subgraph neighbor scans when Redis VSS is
-- unavailable. Embeddings are 1536-dim (OpenAI text-embedding-3-small).
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Profiles (linked directly to Supabase Auth)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  -- Letta Cloud agent provisioned for this user during onboarding.
  letta_agent_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- Clusters (shared workspaces)
-- ---------------------------------------------------------------------------
CREATE TABLE public.clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ---------------------------------------------------------------------------
-- Cluster members
-- ---------------------------------------------------------------------------
CREATE TABLE public.cluster_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID REFERENCES public.clusters(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('admin', 'member')) DEFAULT 'member' NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (cluster_id, user_id)
);

CREATE INDEX cluster_members_user_id_idx ON public.cluster_members (user_id);
CREATE INDEX cluster_members_cluster_id_idx ON public.cluster_members (cluster_id);

-- ---------------------------------------------------------------------------
-- Semantic nodes
-- ---------------------------------------------------------------------------
CREATE TABLE public.semantic_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  cluster_id UUID REFERENCES public.clusters(id) ON DELETE CASCADE NOT NULL,
  app TEXT NOT NULL,
  topic TEXT NOT NULL,
  concept TEXT NOT NULL,
  error_type TEXT,
  raw_descriptor TEXT NOT NULL,
  embedding VECTOR(1536) NOT NULL, -- matching OpenAI text-embedding-3-small
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX semantic_nodes_cluster_id_idx ON public.semantic_nodes (cluster_id);
CREATE INDEX semantic_nodes_user_id_idx ON public.semantic_nodes (user_id);
-- Approximate nearest-neighbor index for the pgvector fallback path.
CREATE INDEX semantic_nodes_embedding_idx
  ON public.semantic_nodes
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ---------------------------------------------------------------------------
-- Semantic edges
-- ---------------------------------------------------------------------------
CREATE TABLE public.semantic_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID REFERENCES public.clusters(id) ON DELETE CASCADE NOT NULL,
  source_node_id UUID REFERENCES public.semantic_nodes(id) ON DELETE CASCADE NOT NULL,
  target_node_id UUID REFERENCES public.semantic_nodes(id) ON DELETE CASCADE NOT NULL,
  type TEXT CHECK (type IN ('RELATED_TO', 'CONTRADICTS', 'BUILDS_ON')) NOT NULL,
  explanation TEXT NOT NULL,
  similarity DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (source_node_id, target_node_id)
);

CREATE INDEX semantic_edges_cluster_id_idx ON public.semantic_edges (cluster_id);
CREATE INDEX semantic_edges_source_idx ON public.semantic_edges (source_node_id);
CREATE INDEX semantic_edges_target_idx ON public.semantic_edges (target_node_id);

-- ---------------------------------------------------------------------------
-- Team invites
-- ---------------------------------------------------------------------------
CREATE TABLE public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID REFERENCES public.clusters(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'revoked')) DEFAULT 'pending' NOT NULL,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX invites_cluster_id_idx ON public.invites (cluster_id);
CREATE INDEX invites_email_idx ON public.invites (email);

-- ---------------------------------------------------------------------------
-- Helper: is the current user a member of a given cluster?
-- SECURITY DEFINER avoids recursive RLS evaluation on cluster_members.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_cluster_member(target_cluster UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cluster_members
    WHERE cluster_members.cluster_id = target_cluster
      AND cluster_members.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cluster_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semantic_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semantic_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Profiles: a user can always see/update their own profile, and can see the
-- profiles of anyone sharing a cluster with them.
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can view profiles of their cluster members"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.cluster_members cm1
      JOIN public.cluster_members cm2 ON cm1.cluster_id = cm2.cluster_id
      WHERE cm1.user_id = auth.uid()
        AND cm2.user_id = public.profiles.id
    )
  );

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Clusters: visible to members.
CREATE POLICY "Members can view their clusters"
  ON public.clusters FOR SELECT
  USING (public.is_cluster_member(id));

-- Cluster members: visible to fellow members.
CREATE POLICY "Members can view membership of their clusters"
  ON public.cluster_members FOR SELECT
  USING (public.is_cluster_member(cluster_id));

-- Semantic nodes: full access scoped to clusters the user belongs to.
CREATE POLICY "Users can access nodes in their clusters"
  ON public.semantic_nodes FOR ALL
  USING (public.is_cluster_member(cluster_id))
  WITH CHECK (public.is_cluster_member(cluster_id));

-- Semantic edges: full access scoped to clusters the user belongs to.
CREATE POLICY "Users can access edges in their clusters"
  ON public.semantic_edges FOR ALL
  USING (public.is_cluster_member(cluster_id))
  WITH CHECK (public.is_cluster_member(cluster_id));

-- Invites: cluster admins can manage invites for their clusters.
CREATE POLICY "Admins can manage invites for their clusters"
  ON public.invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.cluster_members
      WHERE cluster_members.cluster_id = public.invites.cluster_id
        AND cluster_members.user_id = auth.uid()
        AND cluster_members.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cluster_members
      WHERE cluster_members.cluster_id = public.invites.cluster_id
        AND cluster_members.user_id = auth.uid()
        AND cluster_members.role = 'admin'
    )
  );

-- NOTE: Edge Functions use the service-role key, which bypasses RLS. The
-- policies above govern direct client (anon/auth) access from the dashboard.
