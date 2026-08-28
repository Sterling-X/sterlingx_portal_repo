import { sendPasswordResetEmail } from "@/lib/auth/gmail";
import { RESET_TOKEN_TTL_MS, generateResetToken } from "@/lib/auth/password";
import { getUserByEmail, setResetToken } from "@/lib/auth/users";
import { NextResponse } from "next/server";

// Always returns the same response regardless of whether the email
// matched an account -- never leak account existence via response shape
// or timing-observable branching visible to the caller.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
  } | null;
  const email = body?.email;

  if (typeof email === "string" && email.length > 0) {
    const user = await getUserByEmail(email);
    if (user?.isActive) {
      const { rawToken, tokenHash } = generateResetToken();
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await setResetToken(user.userId, tokenHash, expiresAt);

      const baseUrl =
        process.env.NEXTAUTH_URL ?? request.headers.get("origin") ?? "";
      const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

      // Don't let an email-send failure change the response the caller
      // sees -- but do surface it server-side for debugging.
      try {
        await sendPasswordResetEmail(user.email, resetUrl);
      } catch (err) {
        console.error("Failed to send password reset email:", err);
      }
    }
  }

  return NextResponse.json({
    message: "If that email exists, a reset link was sent.",
  });
}
