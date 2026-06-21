-- Continuum — Cluster join codes
--
-- Adds a short, shareable `join_code` to every cluster so a user can create a
-- workspace (becoming its admin) and hand the code to teammates, who redeem it
-- to join as members. This complements the existing email-invite path
-- (`invites` + user-invite/user-onboard) with an "anyone with the code" flow
-- driven by the cluster-create / cluster-join Edge Functions.

-- ---------------------------------------------------------------------------
-- Code generator: 8 chars from an unambiguous alphabet (no 0/O/1/I/L), seeded
-- from pgcrypto's CSPRNG so codes are hard to guess.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gen_join_code(len INT DEFAULT 8)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- 31 chars
  bytes BYTEA := gen_random_bytes(len);
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..len LOOP
    result := result || substr(alphabet, 1 + (get_byte(bytes, i - 1) % length(alphabet)), 1);
  END LOOP;
  RETURN result;
END;
$$;

-- ---------------------------------------------------------------------------
-- clusters.join_code — backfill existing rows, then make it a required, unique,
-- auto-generated column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.clusters ADD COLUMN IF NOT EXISTS join_code TEXT;

UPDATE public.clusters SET join_code = public.gen_join_code() WHERE join_code IS NULL;

ALTER TABLE public.clusters ALTER COLUMN join_code SET DEFAULT public.gen_join_code();
ALTER TABLE public.clusters ALTER COLUMN join_code SET NOT NULL;
ALTER TABLE public.clusters ADD CONSTRAINT clusters_join_code_key UNIQUE (join_code);
