"use client";

import type { FirmConfig } from "@/lib/accounts";
import { useCallback, useEffect, useState } from "react";

export function AdminConfigClient() {
  const [active, setActive] = useState<FirmConfig[]>([]);
  const [paused, setPaused] = useState<FirmConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/config");
    const json = (await res.json()) as {
      active: FirmConfig[];
      paused: FirmConfig[];
    };
    setActive(json.active);
    setPaused(json.paused);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(firm: FirmConfig, nextActive: boolean) {
    await fetch("/api/admin/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: firm.slug,
        displayName: firm.displayName,
        isActive: nextActive,
      }),
    });
    await load();
  }

  if (loading) return <p className="text-sm text-white/50">Loading…</p>;

  return (
    <div className="space-y-6">
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
        </ul>
      </div>
    </div>
  );
}
