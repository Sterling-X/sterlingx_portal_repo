import { APP_ROLES, type AppRole, isAdmin } from "@/lib/auth";
import {
  clearUserAppRole,
  setUserAppRole,
  setUserAssignedFirms,
  setUserBlocked,
} from "@/server/auth0-mgmt";
import { getSession } from "@auth0/nextjs-auth0";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await getSession();
  if (!session || !isAdmin(session.user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const body = (await request.json().catch(() => null)) as {
    role?: AppRole | null;
    assignedFirms?: string[];
    blocked?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (
    body.role !== undefined &&
    body.role !== null &&
    !APP_ROLES.includes(body.role)
  ) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    if (body.role !== undefined) {
      if (body.role === null) {
        await clearUserAppRole(userId);
      } else {
        await setUserAppRole(userId, body.role);
      }
    }
    if (body.assignedFirms !== undefined) {
      await setUserAssignedFirms(userId, body.assignedFirms);
    }
    if (body.blocked !== undefined) {
      await setUserBlocked(userId, body.blocked);
    }
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
