import { getPipeline } from "@/lib/pipelines";
import { getLatestSnapshot } from "@/lib/snapshot";
import { getSession } from "@auth0/nextjs-auth0";
import { notFound, redirect } from "next/navigation";

// Singleton-pipeline diagnostics (currently just Waterfall Report) --
// per-firm pipelines use /diagnostics/[pipeline]/[firm] instead. Same
// placeholder scope as that page: raw stage data now, root-cause/fix/
// Apply & Commit is a later pass.
export default async function PipelineDiagnosticsPage({
  params,
}: {
  params: Promise<{ pipeline: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/api/auth/login");

  const { pipeline: pipelineKey } = await params;
  const pipeline = getPipeline(pipelineKey);
  if (!pipeline || pipeline.shape !== "singleton") notFound();

  const snapshot = await getLatestSnapshot(pipelineKey, pipelineKey);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a
        href="/"
        className="mb-4 inline-block text-xs text-white/50 hover:text-white/80"
      >
        ← Back to dashboard
      </a>
      <h1 className="mb-1 text-2xl font-semibold">{pipeline.displayName}</h1>
      <p className="mb-6 text-sm text-white/60">
        Diagnostic detail — coming soon.
      </p>

      {!snapshot && (
        <p className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
          No checkup snapshot found yet. Run "Check Now" on the dashboard first.
        </p>
      )}

      {snapshot && (
        <div className="space-y-4">
          <div className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm">
            <p>
              Last checked: {new Date(snapshot.checkedAt).toLocaleString()} —
              verdict: <strong>{snapshot.verdict}</strong>
            </p>
            <p className="mt-1 text-white/70">{snapshot.notes}</p>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-white/70">
                <tr>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Table</th>
                  <th className="px-4 py-3">Exists</th>
                  <th className="px-4 py-3">Rows</th>
                  <th className="px-4 py-3">Max date</th>
                </tr>
              </thead>
              <tbody>
                {(
                  snapshot.stages as {
                    stage: string;
                    tableRef: string | null;
                    exists: boolean;
                    rowCount: number | null;
                    maxDate: string | null;
                  }[]
                ).map((s) => (
                  <tr key={s.stage} className="border-t border-white/10">
                    <td className="px-4 py-3 font-medium">{s.stage}</td>
                    <td className="px-4 py-3 text-white/60">{s.tableRef}</td>
                    <td className="px-4 py-3">{s.exists ? "yes" : "no"}</td>
                    <td className="px-4 py-3">{s.rowCount ?? "—"}</td>
                    <td className="px-4 py-3">{s.maxDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
