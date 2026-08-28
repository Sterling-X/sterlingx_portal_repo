import { runFullCheckup } from "@/lib/reconcile";
import { writeSnapshot } from "@/lib/snapshot";
import { NextResponse } from "next/server";

// Backs both the dashboard's "Check Now" button and the (documented, not
// yet registered) daily 9AM ET Cloud Scheduler job — see docs/cron-setup.md.
//
// TODO: email/Slack alerting on red/yellow verdicts — deferred per explicit
// instruction; this route only flags status for the dashboard to render.
export async function POST() {
  const results = await runFullCheckup();

  try {
    await writeSnapshot(results);
  } catch (err) {
    // Snapshot table may not exist yet (DDL is PENDING HUMAN REVIEW, not
    // applied) -- don't let that hide a working reconciliation from the UI.
    return NextResponse.json({
      results,
      snapshotWritten: false,
      snapshotError: (err as Error).message,
    });
  }

  return NextResponse.json({ results, snapshotWritten: true });
}
