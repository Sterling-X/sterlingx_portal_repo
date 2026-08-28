import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Public: the auth pages themselves, NextAuth's own API routes, and the
// checkup endpoint (which authenticates itself via session-or-cron-secret
// inside the route handler -- see src/app/api/offline-conversion-checkup/route.ts).
const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/api/offline-conversion-checkup",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/api/admin") && req.auth.user.role !== "admin") {
    return NextResponse.json(
      { error: "forbidden — admin role required" },
      { status: 403 },
    );
  }

  if (pathname.startsWith("/admin") && req.auth.user.role !== "admin") {
    return NextResponse.redirect(new URL("/?forbidden=1", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
