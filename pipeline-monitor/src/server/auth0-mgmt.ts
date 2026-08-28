// Auth0 Management API helpers (client-credentials M2M) -- adapted from
// AI-Projects' client-performance-dashboard/src/server/auth0-mgmt.ts, the
// proven pattern for the same Auth0 tenant. That reference app only has a
// binary admin/not-admin model; this app needs three mutually-exclusive
// roles (admin/developer/user) plus per-user firm assignment for `user`
// accounts.
//
// assigned_firms lives in Auth0 app_metadata, not a custom ID-token claim.
// The "Add Roles to Token" Action that injects the `roles` claim (see
// src/lib/auth.ts) is shared across every app in this tenant -- adding an
// assigned_firms claim there would leak into other apps' tokens, which is
// out of scope to touch. Reading app_metadata via the Management API
// instead means an extra network call per protected data-fetch for
// `user`-role sessions -- an acceptable tradeoff for not touching a shared
// resource. See docs/auth0-app-setup.md for the one-time tenant setup this
// depends on (the app registration, the three roles existing, and this
// app being authorized for the Management API).
import type { AppRole } from "@/lib/auth";
import { APP_ROLES } from "@/lib/auth";

const domain = () => process.env.AUTH0_ISSUER_BASE_URL?.replace("https://", "");

export async function getManagementToken(): Promise<string> {
  const d = domain();
  const res = await fetch(`https://${d}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      audience: `https://${d}/api/v2/`,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });
  const data = (await res.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!data.access_token) {
    throw new Error(
      data.error_description ?? "Failed to get Auth0 management token",
    );
  }
  return data.access_token;
}

async function api<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`https://${domain()}/api/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Auth0 API ${res.status}`);
  }
  // DELETE returns 204/no body
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Auth0 role ids for this app's three roles, by name. Roles must already exist -- see docs/auth0-app-setup.md. */
async function getAppRoleIds(
  token: string,
): Promise<Record<AppRole, string | null>> {
  const roles = await api<Array<{ id: string; name: string }>>(
    token,
    "/roles?per_page=100",
  );
  const byName = new Map(roles.map((r) => [r.name.toLowerCase(), r.id]));
  return {
    admin: byName.get("admin") ?? null,
    developer: byName.get("developer") ?? null,
    user: byName.get("user") ?? null,
  };
}

async function removeFromAppRoles(
  token: string,
  userId: string,
  roleIds: Record<AppRole, string | null>,
  except: AppRole | null,
): Promise<void> {
  const toRemove = APP_ROLES.filter((r) => r !== except)
    .map((r) => roleIds[r])
    .filter((id): id is string => Boolean(id));
  for (const id of toRemove) {
    await api(token, `/roles/${id}/users`, {
      method: "DELETE",
      body: JSON.stringify({ users: [userId] }),
    }).catch(() => {
      // Not a member of that role -- nothing to remove, not an error.
    });
  }
}

export interface ManagedUser {
  userId: string;
  name: string;
  email: string;
  role: AppRole | null;
  assignedFirms: string[];
  blocked: boolean;
}

/** All Auth0 users in the tenant, with this app's role (if any) and assigned_firms. */
export async function listManagedUsers(): Promise<ManagedUser[]> {
  const token = await getManagementToken();
  const [users, roleIds] = await Promise.all([
    api<
      Array<{
        user_id: string;
        email: string;
        name: string;
        blocked?: boolean;
        app_metadata?: { assigned_firms?: string[] };
      }>
    >(
      token,
      "/users?per_page=100&fields=user_id%2Cemail%2Cname%2Cblocked%2Capp_metadata&include_fields=true",
    ),
    getAppRoleIds(token),
  ]);

  // One membership call per configured app role, not per user -- keeps
  // this to a handful of requests regardless of how many users exist.
  const roleMembers = new Map<AppRole, Set<string>>();
  for (const role of APP_ROLES) {
    const id = roleIds[role];
    if (!id) continue;
    const members = await api<Array<{ user_id: string }>>(
      token,
      `/roles/${id}/users?per_page=100`,
    );
    roleMembers.set(role, new Set(members.map((m) => m.user_id)));
  }

  return users.map((u) => ({
    userId: u.user_id,
    name: u.name,
    email: u.email,
    role: APP_ROLES.find((r) => roleMembers.get(r)?.has(u.user_id)) ?? null,
    assignedFirms: u.app_metadata?.assigned_firms ?? [],
    blocked: u.blocked ?? false,
  }));
}

/** Sets this app's role for a user, removing membership in the other two first -- mutually exclusive in this app's UI even though Auth0 itself allows multiple roles per user. */
export async function setUserAppRole(
  userId: string,
  role: AppRole,
): Promise<void> {
  const token = await getManagementToken();
  const roleIds = await getAppRoleIds(token);
  await removeFromAppRoles(token, userId, roleIds, role);

  const addId = roleIds[role];
  if (!addId) {
    throw new Error(
      `No Auth0 role named "${role}" exists -- see docs/auth0-app-setup.md.`,
    );
  }
  await api(token, `/roles/${addId}/users`, {
    method: "POST",
    body: JSON.stringify({ users: [userId] }),
  });
}

/** Removes a user from all three of this app's roles -- explicit "no access" rather than defaulting to any one of them. */
export async function clearUserAppRole(userId: string): Promise<void> {
  const token = await getManagementToken();
  const roleIds = await getAppRoleIds(token);
  await removeFromAppRoles(token, userId, roleIds, null);
}

export async function setUserAssignedFirms(
  userId: string,
  firms: string[],
): Promise<void> {
  const token = await getManagementToken();
  await api(token, `/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ app_metadata: { assigned_firms: firms } }),
  });
}

export async function setUserBlocked(
  userId: string,
  blocked: boolean,
): Promise<void> {
  const token = await getManagementToken();
  await api(token, `/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ blocked }),
  });
}

/** Used server-side to enforce a `user`-role session's firm scope -- reads app_metadata fresh each call rather than trusting a token claim (see file header). */
export async function getAssignedFirms(userId: string): Promise<string[]> {
  const token = await getManagementToken();
  const user = await api<{ app_metadata?: { assigned_firms?: string[] } }>(
    token,
    `/users/${encodeURIComponent(userId)}`,
  );
  return user.app_metadata?.assigned_firms ?? [];
}
