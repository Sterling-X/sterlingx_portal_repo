import {
  DashboardClient,
  type PipelineTabData,
} from "@/components/dashboard-client";
import { currentAppRole } from "@/lib/auth";
import { getEffectiveFirmConfig } from "@/lib/firm-config";
import { PIPELINES } from "@/lib/pipelines";
import { getAssignedFirms } from "@/server/auth0-mgmt";
import { getSession } from "@auth0/nextjs-auth0";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // Defense in depth -- middleware already gates this route, but a server
  // component that reads session data shouldn't assume it always ran.
  const session = await getSession();
  if (!session) {
    redirect("/api/auth/login");
  }

  const role = currentAppRole(session.user);
  if (!role) {
    // Signed in via Auth0, but not yet assigned one of this app's three
    // roles -- see docs/auth0-app-setup.md and /admin/users.
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center text-sm text-white/60">
        Your account doesn't have access to this app yet. Ask an admin to assign
        you a role.
      </div>
    );
  }

  let assignedFirms: string[] | null = null;
  if (role === "user") {
    assignedFirms = await getAssignedFirms(session.user.sub as string);
  }

  // Plain-data only past this point -- do not pass a PipelineDefinition
  // itself (or anything importing @/lib/bigquery) down to the client
  // component. That module instantiates the Node-only
  // @google-cloud/bigquery client at import time; a "use client"
  // component pulling it in would break the browser bundle.
  const tabs: PipelineTabData[] = [];
  for (const pipeline of PIPELINES) {
    if (pipeline.shape === "singleton") {
      tabs.push({
        key: pipeline.key,
        displayName: pipeline.displayName,
        description: pipeline.description,
        shape: "singleton",
        active: [],
        paused: [],
      });
      continue;
    }

    const { active, paused } = await getEffectiveFirmConfig(pipeline);
    // Note: assignedFirms is currently scoped to Offline Conversion's
    // slug space (see admin-users-client.tsx) -- a `user`-role account
    // will see zero firms under any pipeline whose slugs don't overlap,
    // which fails closed (safe) rather than open, but isn't fully
    // pipeline-aware yet. Flagged as follow-up work, not fixed here.
    const visibleActive =
      role === "user" && assignedFirms
        ? active.filter((f) => assignedFirms?.includes(f.slug))
        : active;

    tabs.push({
      key: pipeline.key,
      displayName: pipeline.displayName,
      description: pipeline.description,
      shape: "per-firm",
      active: visibleActive,
      paused: role === "user" ? [] : paused,
    });
  }

  return (
    <DashboardClient
      role={role}
      userName={(session.user.name as string) ?? (session.user.email as string)}
      tabs={tabs}
    />
  );
}
