import { auth } from "@/auth";
import { DashboardClient } from "@/components/dashboard-client";
import { getEffectiveFirmConfig } from "@/lib/firm-config";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  // Defense in depth -- middleware already gates this route, but a server
  // component that reads session data shouldn't assume it always ran.
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { active, paused } = await getEffectiveFirmConfig();
  const visibleActive =
    session.user.role === "user"
      ? active.filter((f) => session.user.assignedFirms.includes(f.slug))
      : active;

  return (
    <DashboardClient
      role={session.user.role}
      userName={session.user.name}
      visibleActiveFirms={visibleActive}
      pausedFirms={paused}
    />
  );
}
