import { getPipeline } from "@/lib/pipelines";
import { getLatestSnapshot } from "@/lib/snapshot";
import { getSession } from "@auth0/nextjs-auth0";
import { notFound, redirect } from "next/navigation";

// Placeholder diagnostic detail page -- shows the raw stage data from the
// most recent checkup snapshot so a red/yellow result is at least
// inspectable now. Root-cause generation, a proposed fix, a test preview,
// and the "Apply & Commit" action that pushes a fix to Dataform are a
// separate, later pass (they need an LLM integration and real Dataform
// write credentials this pipeline-monitor deploy doesn't have yet) --
// intentionally not built here.
export default async function FirmDiagnosticsPage({
  params,
}: {
  params: Promise<{ pipeline: string; firm: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/api/auth/login");

  const { pipeline: pipelineKey, firm } = await params;
  const pipeline = getPipeline(pipelineKey);
  if (!pipeline || pipeline.shape !== "per-firm") notFound();

  const allFirms = [
    ...pipeline.defaultActiveFirms,
    ...pipeline.defaultPausedFirms,
  ];
  const firmConfig = allFirms.find((f) => f.slug === firm);
  const displayName = firmConfig?.displayName ?? firm;

  const snapshot = await getLatestSnapshot(pipelineKey, firm);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a
        href="/"
        className="mb-4 inline-block text-xs text-white/50 hover:text-white/80"
      >
        ← Back to dashboard
      </a>
      <h1 className="mb-1 text-2xl font-semibold">
        {pipeline.displayName} — {displayName}
      </h1>
      <p className="mb-6 text-sm text-white/60">
        Diagnostic detail — coming soon.
      </p>

      {!snapshot && (
        <p className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60">
          No checkup snapshot found yet for this firm. Run "Check Now" on the
          dashboard first.
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
