"use client";

import { ACTIVE_FIRMS } from "@/lib/accounts";
import type { Role } from "@/lib/auth/users";
import { useCallback, useEffect, useState } from "react";

interface UserRow {
  userId: string;
  name: string;
  email: string;
  role: Role;
  assignedFirms: string[];
  isActive: boolean;
}

export function AdminUsersClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("developer");
  const [assignedFirms, setAssignedFirms] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState<string | null>(null);

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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateMessage(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          role,
          assignedFirms: role === "user" ? assignedFirms : [],
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        emailSent?: boolean;
      };
      if (!res.ok) {
        setCreateMessage(json.error ?? "Failed to create user.");
      } else {
        setCreateMessage(
          json.emailSent
            ? `Invite sent to ${email}.`
            : "User created, but the invite email failed to send — check Gmail API config.",
        );
        setName("");
        setEmail("");
        setRole("developer");
        setAssignedFirms([]);
        await loadUsers();
      }
    } finally {
      setCreating(false);
    }
  }

  async function updateUser(userId: string, updates: Partial<UserRow>) {
    await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    await loadUsers();
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleCreate}
        className="space-y-3 rounded-lg border border-white/10 p-4"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/50">
          Invite a new user
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <input
            placeholder="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <input
            placeholder="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-blue-500"
        >
          <option value="admin">Admin — full access + user management</option>
          <option value="developer">
            Developer — full data access, no user/config management
          </option>
          <option value="user">User — only assigned firms</option>
        </select>
        {role === "user" && (
          <div className="flex flex-wrap gap-2">
            {ACTIVE_FIRMS.map((f) => (
              <label
                key={f.slug}
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-xs"
              >
                <input
                  type="checkbox"
                  checked={assignedFirms.includes(f.slug)}
                  onChange={(e) =>
                    setAssignedFirms((prev) =>
                      e.target.checked
                        ? [...prev, f.slug]
                        : prev.filter((s) => s !== f.slug),
                    )
                  }
                />
                {f.displayName}
              </label>
            ))}
          </div>
        )}
        <button
          type="submit"
          disabled={creating}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {creating ? "Sending invite…" : "Create + send invite"}
        </button>
        {createMessage && (
          <p className="text-sm text-white/70">{createMessage}</p>
        )}
      </form>

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
              <th className="px-4 py-3">Active</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-t border-white/10">
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3 text-white/70">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) =>
                      updateUser(u.userId, { role: e.target.value as Role })
                    }
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs"
                  >
                    <option value="admin">admin</option>
                    <option value="developer">developer</option>
                    <option value="user">user</option>
                  </select>
                </td>
                <td className="px-4 py-3 text-white/60">
                  {u.role === "user"
                    ? u.assignedFirms.join(", ") || "none"
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      updateUser(u.userId, { isActive: !u.isActive })
                    }
                    className={
                      u.isActive
                        ? "rounded-md bg-emerald-600/20 px-2 py-1 text-xs text-emerald-300"
                        : "rounded-md bg-red-600/20 px-2 py-1 text-xs text-red-300"
                    }
                  >
                    {u.isActive ? "Active" : "Deactivated"}
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
