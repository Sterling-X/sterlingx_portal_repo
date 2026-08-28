import { randomBytes } from "node:crypto";
import { auth } from "@/auth";
import { sendPasswordResetEmail } from "@/lib/auth/gmail";
import {
  RESET_TOKEN_TTL_MS,
  generateResetToken,
  hashPassword,
} from "@/lib/auth/password";
import {
  type Role,
  createUser,
  listUsers,
  setResetToken,
} from "@/lib/auth/users";
import { NextResponse } from "next/server";

// Role check is redundant with src/middleware.ts's /api/admin/* guard --
// kept here too so this route is safe even if middleware config drifts.
async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return null;
  }
  return session;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const users = await listUsers();
  return NextResponse.json({
    users: users.map((u) => ({
      userId: u.userId,
      name: u.name,
      email: u.email,
      role: u.role,
      assignedFirms: u.assignedFirms,
      isActive: u.isActive,
    })),
  });
}

const VALID_ROLES: Role[] = ["admin", "developer", "user"];

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    role?: string;
    assignedFirms?: string[];
  } | null;

  if (
    typeof body?.name !== "string" ||
    typeof body?.email !== "string" ||
    !VALID_ROLES.includes(body?.role as Role)
  ) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const role = body.role as Role;
  const assignedFirms = role === "user" ? (body.assignedFirms ?? []) : [];

  // No usable password on creation -- a random value nobody knows, hashed,
  // satisfies the NOT NULL column. The invited user sets their own
  // password via the same reset-token flow forgot-password uses.
  const unusablePasswordHash = await hashPassword(
    randomBytes(32).toString("hex"),
  );

  let userId: string;
  try {
    userId = await createUser({
      name: body.name,
      email: body.email,
      unusablePasswordHash,
      role,
      assignedFirms,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 409 },
    );
  }

  const { rawToken, tokenHash } = generateResetToken();
  await setResetToken(
    userId,
    tokenHash,
    new Date(Date.now() + RESET_TOKEN_TTL_MS),
  );

  const baseUrl =
    process.env.NEXTAUTH_URL ?? request.headers.get("origin") ?? "";
  const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

  let emailSent = true;
  try {
    await sendPasswordResetEmail(body.email, resetUrl);
  } catch (err) {
    emailSent = false;
    console.error("Failed to send invite email:", err);
  }

  return NextResponse.json({ userId, emailSent });
}
