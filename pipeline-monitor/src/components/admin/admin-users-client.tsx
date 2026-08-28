"use client";

import { ACTIVE_FIRMS } from "@/lib/accounts";
import type { AppRole } from "@/lib/auth";
import { useCallback, useEffect, useState } from "react";

interface UserRow {
  userId: string;
  name: string;
  email: string;
  role: AppRole | null;
  assignedFirms: string[];
  blocked: boolean;
}

// Manages role + firm-assignment for accounts that already exist in Auth0.
// This page does not create accounts -- new users sign up via Auth0
// Universal Login (if "Allow signups" is enabled on this app's Auth0
// Application) or are invited directly from the Auth0 Dashboard. Once an
// account exists, an admin assigns it a role here, and (for `user`-role
// accounts) which firms it can see.
export function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error(`Failed to load users: ${res.status}`);
      const json = (await res.json()) as { users: UserRow[] };
      setUsers(json.users);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function updateUser(
    userId: string,
    updates: Partial<Omit<UserRow, "role">> & { role?: AppRole | null },
  ) {
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await loadUsers();
  }

  return (
    <div className="space-y-6">
      <p className="rounded-md border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/60">
        New accounts sign up via Auth0 (or are invited from the Auth0 Dashboard)
        — this page assigns a role and, for `user`-role accounts, which firms
        they can see. It does not create accounts.
      </p>

      {loading && <p className="text-sm text-white/50">Loading users…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-white/70">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Assigned firms</th>
              <th className="px-4 py-3">Access</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-t border-white/10">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 text-white/70">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role ?? ""}
                    onChange={(e) =>
                      updateUser(u.userId, {
                        role: (e.target.value || null) as AppRole | null,
                      })
                    }
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs"
                  >
                    <option value="">— none —</option>
                    <option value="admin">admin</option>
                    <option value="developer">developer</option>
                    <option value="user">user</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-white/60">
                  {u.role === "user" ? (
                    <div className="flex flex-wrap gap-2">
                      {ACTIVE_FIRMS.map((f) => (
                        <label
                          key={f.slug}
                          className="flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={u.assignedFirms.includes(f.slug)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...u.assignedFirms, f.slug]
                                : u.assignedFirms.filter((s) => s !== f.slug);
                              updateUser(u.userId, { assignedFirms: next });
                            }}
                          />
                          {f.displayName}
                        </label>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      updateUser(u.userId, { blocked: !u.blocked })
                    }
                    className={
                      u.blocked
                        ? "rounded-md bg-red-600/20 px-2 py-1 text-xs text-red-300"
                        : "rounded-md bg-emerald-600/20 px-2 py-1 text-xs text-emerald-300"
                    }
                  >
                    {u.blocked ? "Blocked" : "Active"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
