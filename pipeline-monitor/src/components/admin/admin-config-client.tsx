"use client";

import type { FirmConfig } from "@/lib/accounts";
import { useCallback, useEffect, useState } from "react";

interface PipelineOption {
  key: string;
  displayName: string;
}

export function AdminConfigClient({
  pipelines,
}: { pipelines: PipelineOption[] }) {
  const [pipelineKey, setPipelineKey] = useState(pipelines[0]?.key);
  const [active, setActive] = useState<FirmConfig[]>([]);
  const [paused, setPaused] = useState<FirmConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    const res = await fetch(
      `/api/admin/config?pipeline=${encodeURIComponent(key)}`,
    );
    const json = (await res.json()) as {
      active: FirmConfig[];
      paused: FirmConfig[];
    };
    setActive(json.active);
    setPaused(json.paused);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (pipelineKey) load(pipelineKey);
  }, [pipelineKey, load]);

  async function toggle(firm: FirmConfig, nextActive: boolean) {
    if (!pipelineKey) return;
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pipeline: pipelineKey,
        slug: firm.slug,
        displayName: firm.displayName,
        isActive: nextActive,
      }),
    });
    await load(pipelineKey);
  }

  if (!pipelineKey)
    return (
      <p className="text-sm text-white/50">No per-firm pipelines configured.</p>
    );

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-white/10">
        {pipelines.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPipelineKey(p.key)}
            className={`rounded-t-md px-3 py-1.5 text-xs font-medium ${
              p.key === pipelineKey
                ? "border border-b-0 border-white/10 bg-white/5 text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {p.displayName}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-white/50">Loading…</p>
      ) : (
        <>
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/50">
              Active — tracked daily
            </h2>
            <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
              {active.map((f) => (
                <li
                  key={f.slug}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span>{f.displayName}</span>
                  <button
                    type="button"
                    onClick={() => toggle(f, false)}
                    className="rounded-md bg-amber-600/20 px-3 py-1 text-xs text-amber-300 hover:bg-amber-600/30"
                  >
                    Pause
                  </button>
                </li>
              ))}
              {active.length === 0 && (
                <li className="px-4 py-3 text-sm text-white/40">
                  No active firms.
                </li>
              )}
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/50">
              Paused — excluded from checks
            </h2>
            <ul className="divide-y divide-white/10 rounded-lg border border-white/10 opacity-70">
              {paused.map((f) => (
                <li
                  key={f.slug}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span>{f.displayName}</span>
                  <button
                    type="button"
                    onClick={() => toggle(f, true)}
                    className="rounded-md bg-emerald-600/20 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-600/30"
                  >
                    Resume tracking
                  </button>
                </li>
              ))}
              {paused.length === 0 && (
                <li className="px-4 py-3 text-sm text-white/40">
                  No paused firms.
                </li>
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
