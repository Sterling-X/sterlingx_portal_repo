import { timingSafeEqual } from "node:crypto";
import { currentAppRole } from "@/lib/auth";
import { getEffectiveFirmConfig } from "@/lib/firm-config";
import { getPipeline, runPipelineCheckup } from "@/lib/pipelines";
import { writeSnapshot } from "@/lib/snapshot";
import { getAssignedFirms } from "@/server/auth0-mgmt";
import { getSession } from "@auth0/nextjs-auth0";
import { NextResponse } from "next/server";

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Generic checkup route for any pipeline in src/lib/pipelines/index.ts --
// backs the dashboard's per-tab "Check Now" button and (once registered)
// each pipeline's own daily Cloud Scheduler job. Same auth shape as the
// original /api/offline-conversion-checkup route: session (Auth0 cookie)
// OR a CHECKUP_CRON_SECRET header, via X-Checkup-Cron-Secret rather than
// Authorization since Cloud Run's own IAM layer already owns that header
// for the scheduler's OIDC identity token. Excluded from
// src/middleware.ts's matcher for the same reason.
//
// TODO: email/Slack alerting on red/yellow verdicts — deferred per
// explicit instruction; this route only flags status for the dashboard.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ pipeline: string }> },
) {
  const { pipeline: pipelineKey } = await params;
  const pipeline = getPipeline(pipelineKey);
  if (!pipeline) {
    return NextResponse.json(
      { error: `unknown pipeline: ${pipelineKey}` },
      { status: 404 },
    );
  }

  const session = await getSession();

  if (!session) {
    const expected = process.env.CHECKUP_CRON_SECRET;
    const provided = request.headers.get("x-checkup-cron-secret");
    if (!expected || !provided || !secretMatches(provided, expected)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (pipeline.shape === "singleton") {
    // No firm-scoping to enforce -- a singleton pipeline has one shared
    // status, visible to every authenticated role (still gated by
    // middleware/route-level auth above, just not per-firm).
    if (session && !currentAppRole(session.user)) {
      return NextResponse.json(
        { error: "forbidden — no role assigned for this app" },
        { status: 403 },
      );
    }
    const results = await runPipelineCheckup(pipeline);
    return respondWithSnapshot(results);
  }

  const { active } = await getEffectiveFirmConfig(pipeline);

  // Enforcement boundary: a `user`-role account can only ever trigger a
  // checkup against its own assigned_firms, regardless of what a client
  // might otherwise imply — not just a UI-level filter. A
  // secret-authenticated (scheduler) call has no session and runs the
  // full active-firm list. Note: assignedFirms is currently scoped to
  // Offline Conversion's slug space only (see admin-users-client.tsx) --
  // a `user`-role account will see zero firms under any other pipeline
  // until that's made pipeline-aware.
  let firms = active;
  if (session) {
    const role = currentAppRole(session.user);
    if (!role) {
      return NextResponse.json(
        { error: "forbidden — no role assigned for this app" },
        { status: 403 },
      );
    }
    if (role === "user") {
      const assignedFirms = await getAssignedFirms(session.user.sub as string);
      firms = active.filter((f) => assignedFirms.includes(f.slug));
    }
  }

  const results = await runPipelineCheckup(pipeline, firms);
  return respondWithSnapshot(results);
}

async function respondWithSnapshot(
  results: Awaited<ReturnType<typeof runPipelineCheckup>>,
) {
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
