import { AdminUsersClient } from "@/components/admin/admin-users-client";

export default function AdminUsersPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold">User Management</h1>
      <p className="mb-6 text-sm text-white/60">
        Admin only. Create accounts, assign roles, and scope which firms a
        `user`-role account can see.
      </p>
      <AdminUsersClient />
    </div>
  );
}
