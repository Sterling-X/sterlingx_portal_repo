import { AdminConfigClient } from "@/components/admin/admin-config-client";

export default function AdminConfigPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Tracked Firms</h1>
      <p className="mb-6 text-sm text-white/60">
        Admin only. Toggle which firms the daily and on-demand checkup actually
        queries.
      </p>
      <AdminConfigClient />
    </div>
  );
}
