import { timingSafeEqual } from "node:crypto";
import { currentAppRole } from "@/lib/auth";
import { getEffectiveFirmConfig } from "@/lib/firm-config";
import { runFullCheckup } from "@/lib/reconcile";
import { writeSnapshot } from "@/lib/snapshot";
import { getAssignedFirms } from "@/server/auth0-mgmt";
import { getSession } from "@auth0/nextjs-auth0";
import { NextResponse } from "next/server";

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Backs both the dashboard's "Check Now" button (browser fetch, carries an
// Auth0 session cookie) and the daily 9AM ET Cloud Scheduler job (see
// docs/deploy-commands.md step 4), which has no session cookie -- it
// authenticates two ways stacked: an OIDC identity token verified by Cloud
// Run's own IAM layer before the request ever reaches this app
// (--no-allow-unauthenticated, see docs/deploy-commands.md), plus this
// route's own CHECKUP_CRON_SECRET check as a second, app-level factor --
// matching the AI-Projects client-data-validator health-check route's
// convention. This uses a dedicated `X-Checkup-Cron-Secret` header, not
// `Authorization` -- Cloud Run's IAM layer already owns the `Authorization`
// header for the caller's OIDC identity token, so the app-level secret
// needs its own header or the two would collide. This route is excluded
// from src/middleware.ts's matcher precisely because it needs this
// session-OR-secret logic instead of a redirect.
//
// TODO: email/Slack alerting on red/yellow verdicts — deferred per explicit
// instruction; this route only flags status for the dashboard to render.
export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    const expected = process.env.CHECKUP_CRON_SECRET;
    const provided = request.headers.get("x-checkup-cron-secret");

    if (!expected || !provided || !secretMatches(provided, expected)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const { active } = await getEffectiveFirmConfig();

  // Enforcement boundary: a `user`-role account can only ever trigger a
  // checkup against its own assigned_firms, regardless of what a client
  // might otherwise imply — this is not just a UI-level filter. A
  // secret-authenticated (scheduler) call has no session and runs the
  // full active-firm list.
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

  const results = await runFullCheckup(firms);

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
