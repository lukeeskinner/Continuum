-- Continuum — Cluster sharing policy
--
-- Moves the per-cluster share policy into the backend so the desktop no longer
-- needs the CONTINUUM_CLUSTER_SHARE_MODE env override. The desktop's
-- resolve_cluster_policy already reads `clusters.sharing_mode`:
--   'members'  — members share SHARED_ANON observations (the per-observation
--                privacy floor in share_policy still applies);
--   'disabled' — withhold all sharing;
--   'opt_in'   — share only for members who have locally opted in.
--
-- Default 'members' so a workspace you create/join syncs out of the box; an
-- admin can set 'disabled' to pause cluster-wide sharing.

ALTER TABLE public.clusters
  ADD COLUMN IF NOT EXISTS sharing_mode TEXT NOT NULL DEFAULT 'members'
  CHECK (sharing_mode IN ('disabled', 'members', 'opt_in'));
