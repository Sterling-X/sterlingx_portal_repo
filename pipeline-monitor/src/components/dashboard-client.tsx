"use client";

import { StatusBadge } from "@/components/status-badge";
import type { FirmConfig } from "@/lib/accounts";
import type { AppRole } from "@/lib/auth";
import type { FirmCheckupResult, Verdict } from "@/lib/pipelines";
import { useMemo, useState } from "react";

export interface PipelineTabData {
  key: string;
  displayName: string;
  description: string;
  shape: "per-firm" | "singleton";
  active: FirmConfig[];
  paused: FirmConfig[];
}

interface CheckupResponse {
  results: FirmCheckupResult[];
  snapshotWritten: boolean;
  snapshotError?: string;
}

interface DashboardClientProps {
  role: AppRole;
  userName: string;
  tabs: PipelineTabData[];
}

const VERDICT_ORDER: Verdict[] = ["red", "yellow", "green"];

export function DashboardClient({
  role,
  userName,
  tabs,
}: DashboardClientProps) {
  const [activeTabKey, setActiveTabKey] = useState(tabs[0]?.key);
  const [dataByTab, setDataByTab] = useState<
    Record<string, CheckupResponse | undefined>
  >({});
  const [loadingTab, setLoadingTab] = useState<string | null>(null);
  const [errorByTab, setErrorByTab] = useState<
    Record<string, string | undefined>
  >({});
  const [lastRunByTab, setLastRunByTab] = useState<
    Record<string, string | undefined>
  >({});
  const [filterText, setFilterText] = useState("");

  const activeTab = tabs.find((t) => t.key === activeTabKey) ?? tabs[0];

  async function runCheckup(pipelineKey: string) {
    setLoadingTab(pipelineKey);
    setErrorByTab((prev) => ({ ...prev, [pipelineKey]: undefined }));
    try {
      const res = await fetch(`/api/checkup/${pipelineKey}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Checkup failed: ${res.status}`);
      const json = (await res.json()) as CheckupResponse;
      setDataByTab((prev) => ({ ...prev, [pipelineKey]: json }));
      setLastRunByTab((prev) => ({
        ...prev,
        [pipelineKey]: new Date().toLocaleString(),
      }));
    } catch (err) {
      setErrorByTab((prev) => ({
        ...prev,
        [pipelineKey]: (err as Error).message,
      }));
    } finally {
      setLoadingTab(null);
    }
  }

  if (!activeTab) {
    return (
      <p className="mx-auto max-w-lg px-6 py-16 text-center text-sm text-white/60">
        No pipelines configured.
      </p>
    );
  }

  const data = dataByTab[activeTab.key];
  const loading = loadingTab === activeTab.key;
  const error = errorByTab[activeTab.key];
  const lastRun = lastRunByTab[activeTab.key];

  // Defense in depth -- the API route already scopes results server-side
  // by session role, this just guards against stale client state.
  const visibleSlugs = new Set(activeTab.active.map((f) => f.slug));
  const scopedResults = data?.results.filter(
    (r) => activeTab.shape === "singleton" || visibleSlugs.has(r.firm),
  );

  const filteredResults =
    activeTab.shape === "per-firm" && filterText.trim()
      ? scopedResults?.filter((r) =>
          r.displayName.toLowerCase().includes(filterText.trim().toLowerCase()),
        )
      : scopedResults;

  const counts = useMemo(() => {
    const c: Record<Verdict, number> = { green: 0, yellow: 0, red: 0 };
    for (const r of scopedResults ?? []) c[r.verdict]++;
    return c;
  }, [scopedResults]);

  const warningsAndErrors = (scopedResults ?? [])
    .filter((r) => r.verdict !== "green")
    .sort(
      (a, b) =>
        VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict),
    );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-2 flex items-center justify-between text-xs text-white/50">
        <span>
          Signed in as {userName} ({role})
        </span>
        <div className="flex items-center gap-4">
          {role === "admin" && (
            <>
              <a href="/admin/users" className="hover:text-white/80">
                Manage users
              </a>
              <a href="/admin/config" className="hover:text-white/80">
                Tracked firms
              </a>
            </>
          )}
          <a href="/api/auth/logout" className="hover:text-white/80">
            Sign out
          </a>
        </div>
      </div>

      <h1 className="mb-4 text-2xl font-semibold">Pipeline Monitor</h1>

      <div className="mb-6 flex gap-1 border-b border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTabKey(tab.key)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium ${
              tab.key === activeTab.key
                ? "border border-b-0 border-white/10 bg-white/5 text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {tab.displayName}
          </button>
        ))}
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-white/60">{activeTab.description}</p>
        </div>
        <button
          type="button"
          onClick={() => runCheckup(activeTab.key)}
          disabled={
            loading ||
            (activeTab.shape === "per-firm" && activeTab.active.length === 0)
          }
          className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Check Now"}
        </button>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <SummaryCard label="Healthy" count={counts.green} tone="green" />
        <SummaryCard label="Warning" count={counts.yellow} tone="yellow" />
        <SummaryCard label="Error" count={counts.red} tone="red" />
      </div>

      {activeTab.shape === "per-firm" && activeTab.active.length === 0 && (
        <p className="mb-4 rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
          No firms are assigned to your account yet. Ask an admin to assign you
          access.
        </p>
      )}

      {lastRun && (
        <p className="mb-2 text-xs text-white/50">Last run: {lastRun}</p>
      )}
      {error && <p className="mb-4 text-sm text-red-400">Error: {error}</p>}
      {data && !data.snapshotWritten && (
        <p className="mb-4 text-xs text-amber-400">
          Snapshot not written ({data.snapshotError ?? "unknown reason"}) —
          results below are live but not persisted. Likely the snapshot table
          hasn't been created yet; see sql/pipeline_health_status.sql.
        </p>
      )}

      {/* Explicit warnings/errors list with diagnostic links */}
      {warningsAndErrors.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/50">
            Needs attention
          </h2>
          <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
            {warningsAndErrors.map((r) => (
              <li
                key={r.firm}
                className="flex items-center justify-between px-4 py-2 text-sm"
              >
                <span className="flex items-center gap-3">
                  <StatusBadge verdict={r.verdict} />
                  <span>{r.displayName}</span>
                </span>
                <a
                  href={
                    activeTab.shape === "singleton"
                      ? `/diagnostics/${activeTab.key}`
                      : `/diagnostics/${activeTab.key}/${r.firm}`
                  }
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  View diagnostics →
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activeTab.shape === "per-firm" && activeTab.active.length > 0 && (
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter by account…"
          className="mb-4 w-full max-w-xs rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm placeholder:text-white/30"
        />
      )}

      {(activeTab.shape === "singleton" || activeTab.active.length > 0) && (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-white/70">
              <tr>
                <th className="px-4 py-3">
                  {activeTab.shape === "singleton" ? "Pipeline" : "Firm"}
                </th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Checked</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {!data && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-white/40"
                  >
                    No data yet — click "Check Now" to run the reconciliation.
                  </td>
                </tr>
              )}
              {data && filteredResults?.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-white/40"
                  >
                    No accounts match this filter.
                  </td>
                </tr>
              )}
              {filteredResults?.map((r) => (
                <tr key={r.firm} className="border-t border-white/10">
                  <td className="px-4 py-3 font-medium">
                    {r.verdict === "red" ? (
                      <a
                        href={
                          activeTab.shape === "singleton"
                            ? `/diagnostics/${activeTab.key}`
                            : `/diagnostics/${activeTab.key}/${r.firm}`
                        }
                        className="hover:underline"
                      >
                        {r.displayName}
                      </a>
                    ) : (
                      r.displayName
                    )}
                  </td>
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
      )}

      {role !== "user" &&
        activeTab.shape === "per-firm" &&
        activeTab.paused.length > 0 && (
          <>
            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-white/50">
              Paused (not tracked)
            </h2>
            <div className="overflow-hidden rounded-lg border border-white/10 opacity-50">
              <table className="w-full text-left text-sm">
                <tbody>
                  {activeTab.paused.map((f) => (
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
          </>
        )}
    </div>
  );
}

function SummaryCard({
  label,
  count,
  tone,
}: { label: string; count: number; tone: Verdict }) {
  const styles: Record<Verdict, string> = {
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    yellow: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${styles[tone]}`}>
      <div className="text-2xl font-semibold">{count}</div>
      <div className="text-xs uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}
