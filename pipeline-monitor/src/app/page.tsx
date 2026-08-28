import { DashboardClient } from "@/components/dashboard-client";
import { currentAppRole } from "@/lib/auth";
import { getEffectiveFirmConfig } from "@/lib/firm-config";
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

  const { active, paused } = await getEffectiveFirmConfig();

  let visibleActive = active;
  if (role === "user") {
    const assignedFirms = await getAssignedFirms(session.user.sub as string);
    visibleActive = active.filter((f) => assignedFirms.includes(f.slug));
  }

  return (
    <DashboardClient
      role={role}
      userName={(session.user.name as string) ?? (session.user.email as string)}
      visibleActiveFirms={visibleActive}
      pausedFirms={paused}
    />
  );
}
