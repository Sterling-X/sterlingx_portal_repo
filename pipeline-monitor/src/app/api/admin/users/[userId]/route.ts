import { auth } from "@/auth";
import { type Role, updateUserAccess } from "@/lib/auth/users";
import { NextResponse } from "next/server";

const VALID_ROLES: Role[] = ["admin", "developer", "user"];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const body = (await request.json().catch(() => null)) as {
    role?: string;
    assignedFirms?: string[];
    isActive?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (body.role !== undefined && !VALID_ROLES.includes(body.role as Role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  await updateUserAccess(userId, {
    role: body.role as Role | undefined,
    assignedFirms: body.assignedFirms,
    isActive: body.isActive,
  });

  return NextResponse.json({ ok: true });
}
