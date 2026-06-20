"use client";

// Admin-only invite dialog. Calls the `user-invite` Edge Function, which
// creates an invite token, emails it (if Resend is configured), and returns a
// join link the admin can copy directly.
import { useState } from "react";
import { callFunction } from "@/lib/functions";

interface InviteResponse {
  invite_id: string;
  sent: boolean;
  join_url: string;
}

export default function InviteModal({
  clusterId,
  onClose,
}: {
  clusterId: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InviteResponse | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await callFunction<InviteResponse>("user-invite", {
        email,
        cluster_id: clusterId,
      });
      setResult(res);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-sm font-semibold">Invite a teammate</h2>
        <p className="mb-4 text-xs text-zinc-500">
          They&apos;ll receive a link to join this workspace.
        </p>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-400">
              Invite created{result.sent ? " and emailed." : "."}
            </p>
            <label className="block text-xs text-zinc-400">Join link</label>
            <input
              readOnly
              value={result.join_url}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs"
            />
            <button
              onClick={() => navigator.clipboard?.writeText(result.join_url)}
              className="w-full rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500"
            >
              Copy link
            </button>
            <button
              onClick={onClose}
              className="w-full rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={invite} className="space-y-3">
            <input
              type="email"
              required
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
              >
                {loading ? "Sending…" : "Send invite"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
