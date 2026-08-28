import { isAdmin } from "@/lib/auth";
import { listManagedUsers } from "@/server/auth0-mgmt";
import { getSession } from "@auth0/nextjs-auth0";
import { NextResponse } from "next/server";

// Role check is redundant with src/middleware.ts's page-level admin guard on
// /admin/* -- this route itself isn't covered by that matcher (see
// src/middleware.ts), so this is the actual enforcement, not a backstop.
async function requireAdmin() {
  const session = await getSession();
  if (!session || !isAdmin(session.user)) {
    return null;
  }
  return session;
}

// Lists existing Auth0 accounts with this app's role + assigned_firms.
// No POST here -- this app doesn't create accounts; see
// docs/auth0-app-setup.md and src/components/admin/admin-users-client.tsx.
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const users = await listManagedUsers();
  return NextResponse.json({ users });
}
