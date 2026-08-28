"use client";

import { StatusBadge } from "@/components/status-badge";
import { PAUSED_FIRMS } from "@/lib/accounts";
import type { FirmCheckupResult } from "@/lib/reconcile";
import { useState } from "react";

interface CheckupResponse {
  results: FirmCheckupResult[];
  snapshotWritten: boolean;
  snapshotError?: string;
}

export function DashboardClient() {
  const [data, setData] = useState<CheckupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  async function runCheckup() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/offline-conversion-checkup", {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Checkup failed: ${res.status}`);
      const json = (await res.json()) as CheckupResponse;
      setData(json);
      setLastRun(new Date().toLocaleString());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Offline Conversion Pipeline Monitor
          </h1>
          <p className="text-sm text-white/60">
            Source → origin lead → conversion events → Google Ads, per firm
          </p>
        </div>
        <button
          type="button"
          onClick={runCheckup}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Check Now"}
        </button>
      </div>

      {lastRun && (
        <p className="mb-4 text-xs text-white/50">Last run: {lastRun}</p>
      )}
      {error && <p className="mb-4 text-sm text-red-400">Error: {error}</p>}
      {data && !data.snapshotWritten && (
        <p className="mb-4 text-xs text-amber-400">
          Snapshot not written ({data.snapshotError ?? "unknown reason"}) —
          results below are live but not persisted. Likely the snapshot table
          hasn't been created yet; see sql/offline_conversion_health_status.sql.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-white/70">
            <tr>
              <th className="px-4 py-3">Firm</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Checked</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody>
            {!data && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-white/40">
                  No data yet — click "Check Now" to run the reconciliation.
                </td>
              </tr>
            )}
            {data?.results.map((r) => (
              <tr key={r.firm} className="border-t border-white/10">
                <td className="px-4 py-3 font-medium">{r.displayName}</td>
                <td className="px-4 py-3">
                  <StatusBadge verdict={r.verdict} />
                </td>
                <td className="px-4 py-3 text-white/60">
                  {new Date(r.checkedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-white/70">
                  {r.notes.join("; ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-white/50">
        Paused (not tracked)
      </h2>
      <div className="overflow-hidden rounded-lg border border-white/10 opacity-50">
        <table className="w-full text-left text-sm">
          <tbody>
            {PAUSED_FIRMS.map((f) => (
              <tr
                key={f.slug}
                className="border-t border-white/10 first:border-t-0"
              >
                <td className="px-4 py-3 font-medium">{f.displayName}</td>
                <td className="px-4 py-3 text-white/50">
                  Paused — manual fix in progress, excluded from automated
                  checks
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
