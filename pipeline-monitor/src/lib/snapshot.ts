import { bigquery } from "@/lib/bigquery";
import type { FirmCheckupResult } from "@/lib/reconcile";

const SNAPSHOT_TABLE =
  "rc-datamart-report-082025.pipeline_monitoring.offline_conversion_health_status";

// Writes one row per firm per checkup run. Table must already exist — see
// sql/offline_conversion_health_status.sql (PENDING HUMAN REVIEW, not yet
// applied). If the table doesn't exist yet, this throws and the caller
// still returns the checkup results to the UI — a missing snapshot table
// should not hide a working reconciliation from the person looking at the
// dashboard.
export async function writeSnapshot(
  results: FirmCheckupResult[],
): Promise<void> {
  const rows = results.map((r) => ({
    checked_at: r.checkedAt,
    firm: r.firm,
    verdict: r.verdict,
    notes: r.notes.join(" | "),
    stages_json: JSON.stringify(r.stages),
  }));
  await bigquery
    .dataset("pipeline_monitoring")
    .table("offline_conversion_health_status")
    .insert(rows);
}

export { SNAPSHOT_TABLE };
