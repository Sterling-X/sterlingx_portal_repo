import type { Claims } from "@auth0/nextjs-auth0";

// Custom claim injected by the shared Auth0 "Add Roles to Token" Action --
// one Action, deployed once per Auth0 tenant, shared by every SterlingX app
// (see AI-Projects docs/auth0-setup.md and
// client-performance-dashboard/src/server/auth0-mgmt.ts, the original).
// This app reuses the same tenant and the same claim namespace/shape;
// admin/developer/user are just additional role names an admin can assign
// in that same shared Action, not a separate mechanism.
const ROLES_CLAIM = "https://sterlingx.com/roles";

export type AppRole = "admin" | "developer" | "user";
export const APP_ROLES: AppRole[] = ["admin", "developer", "user"];

function rolesOf(user: Claims): string[] {
  const roles = user[ROLES_CLAIM];
  return Array.isArray(roles) ? roles : [];
}

export function hasRole(user: Claims, role: AppRole): boolean {
  return rolesOf(user).includes(role);
}

export function isAdmin(user: Claims): boolean {
  return hasRole(user, "admin");
}

// developer has full pipeline-data access, same as admin, just not
// user/config management -- see /admin/users and /admin/config route
// guards.
export function isAdminOrDeveloper(user: Claims): boolean {
  return hasRole(user, "admin") || hasRole(user, "developer");
}

// The one app-role that matters here, among the three this app defines. A
// user's Auth0 roles could in principle include other apps' role names too
// (shared tenant) -- this only looks at admin/developer/user, admin taking
// precedence if a session somehow carries more than one.
export function currentAppRole(user: Claims): AppRole | null {
  for (const role of APP_ROLES) {
    if (hasRole(user, role)) return role;
  }
  return null;
}
