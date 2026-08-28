import { hashPassword, hashResetToken } from "@/lib/auth/password";
import {
  getUserByResetTokenHash,
  setPasswordAndClearResetToken,
} from "@/lib/auth/users";
import { NextResponse } from "next/server";

const MIN_PASSWORD_LENGTH = 10;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    password?: string;
  } | null;

  const token = body?.token;
  const password = body?.password;

  if (typeof token !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Missing token or password" },
      { status: 400 },
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  const tokenHash = hashResetToken(token);
  const user = await getUserByResetTokenHash(tokenHash);
  if (!user) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  await setPasswordAndClearResetToken(user.userId, passwordHash);

  return NextResponse.json({ message: "Password updated." });
}
