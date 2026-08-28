import { AdminConfigClient } from "@/components/admin/admin-config-client";
import { PIPELINES } from "@/lib/pipelines";

export default function AdminConfigPage() {
  const perFirmPipelines = PIPELINES.filter((p) => p.shape === "per-firm").map(
    (p) => ({
      key: p.key,
      displayName: p.displayName,
    }),
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Tracked Firms</h1>
      <p className="mb-6 text-sm text-white/60">
        Admin only. Toggle which firms the daily and on-demand checkup actually
        queries, per pipeline. (Waterfall Report has no firms — it's a single
        shared pipeline, not shown here.)
      </p>
      <AdminConfigClient pipelines={perFirmPipelines} />
    </div>
  );
}
