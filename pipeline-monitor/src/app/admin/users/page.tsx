import { AdminUsersClient } from "@/components/admin/admin-users-client";
import { offlineConversionPipeline } from "@/lib/pipelines/offline-conversion";

export default function AdminUsersPage() {
  // Plain-data only past this point -- do not pass the pipeline
  // definition itself into the client component, it imports
  // @/lib/bigquery (instantiates the Node-only @google-cloud/bigquery
  // client at module scope), which breaks the browser bundle.
  const assignableFirms = offlineConversionPipeline.defaultActiveFirms.map(
    (f) => ({
      slug: f.slug,
      displayName: f.displayName,
    }),
  );

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold">User Management</h1>
      <p className="mb-6 text-sm text-white/60">
        Admin only. Assign roles to existing Auth0 accounts, and scope which
        firms a `user`-role account can see. (Assigned-firm restriction
        currently only scopes Offline Conversion -- see admin-users-client.tsx.)
      </p>
      <AdminUsersClient assignableFirms={assignableFirms} />
    </div>
  );
}
