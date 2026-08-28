import { withMiddlewareAuthRequired } from "@auth0/nextjs-auth0/edge";

export default withMiddlewareAuthRequired();

// Pages only -- API routes each do their own getSession() + role check
// (see src/lib/auth.ts and every route under src/app/api/), same pattern
// as AI-Projects' client-performance-dashboard. Gating /api/* here too
// would make withMiddlewareAuthRequired redirect an unauthenticated fetch
// to the Auth0 login page (a 302 to HTML), which breaks every client-side
// fetch() call expecting JSON -- the route-level checks return proper
// 401/403 JSON instead. /api/offline-conversion-checkup is intentionally
// excluded even from its own route-level Auth0 check for unauthenticated
// callers -- it accepts a session OR the CHECKUP_CRON_SECRET header, see
// that route for why.
export const config = {
  matcher: ["/", "/admin/:path*", "/diagnostics/:path*"],
};
