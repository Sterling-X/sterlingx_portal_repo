import { APP_PROJECT, bigquery } from "@/lib/bigquery";
import type { FirmCheckupResult } from "@/lib/pipelines";

const SNAPSHOT_TABLE = `${APP_PROJECT}.pipeline_monitoring.pipeline_health_status`;

// Writes one row per firm (or one row for a singleton pipeline) per
// checkup run. Table must already exist — see
// sql/pipeline_health_status.sql (PENDING HUMAN REVIEW, not yet applied;
// renamed from offline_conversion_health_status.sql now that it holds
// snapshots for every pipeline, not just Offline Conversion). If the
// table doesn't exist yet, this throws and the caller still returns the
// checkup results to the UI — a missing snapshot table should not hide a
// working reconciliation from the person looking at the dashboard.
export async function writeSnapshot(
  results: FirmCheckupResult[],
): Promise<void> {
  const rows = results.map((r) => ({
    checked_at: r.checkedAt,
    pipeline_key: r.pipeline,
    firm: r.firm,
    verdict: r.verdict,
    notes: r.notes.join(" | "),
    stages_json: JSON.stringify(r.stages),
  }));
  await bigquery
    .dataset("pipeline_monitoring")
    .table("pipeline_health_status")
    .insert(rows);
}

export interface LatestSnapshot {
  checkedAt: string;
  verdict: string;
  notes: string;
  stages: unknown[];
}

// Powers the diagnostics placeholder pages -- reads the most recent
// snapshot row for a pipeline+firm so the page has something real to show
// even without the visitor having just clicked "Check Now". Returns null
// if the snapshot table doesn't exist yet or has no matching row (not an
// error -- a checkup just hasn't run yet).
export async function getLatestSnapshot(
  pipelineKey: string,
  firm: string,
): Promise<LatestSnapshot | null> {
  try {
    const [rows] = await bigquery.query({
      query: `
        SELECT checked_at, verdict, notes, stages_json
        FROM \`${SNAPSHOT_TABLE}\`
        WHERE pipeline_key = @pipelineKey AND firm = @firm
        ORDER BY checked_at DESC
        LIMIT 1
      `,
      params: { pipelineKey, firm },
    });
    if (rows.length === 0) return null;
    const row = rows[0] as {
      checked_at: { value: string };
      verdict: string;
      notes: string;
      stages_json: string;
    };
    return {
      checkedAt: row.checked_at.value,
      verdict: row.verdict,
      notes: row.notes,
      stages: JSON.parse(row.stages_json) as unknown[],
    };
  } catch {
    return null;
  }
}

export { SNAPSHOT_TABLE };
