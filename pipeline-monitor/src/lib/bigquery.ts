import { BigQuery } from "@google-cloud/bigquery";

// The app's own hosting/billing project. Query jobs run here, and this is
// where dashboard_firm_config/pipeline_health_status live — the app's own
// state, as opposed to the pipeline data it reads (login/roles/user
// records live in Auth0, not here — see src/lib/auth.ts). Local dev:
// relies on Application Default Credentials (`gcloud auth
// application-default login`). Deployed (Cloud Run): needs a dedicated
// service account with BigQuery Job User here, Data Editor scoped to the
// `pipeline_monitoring` dataset here, and Data Viewer scoped to the
// read-only datasets in REPORT_PROJECT below (cross-project read —
// standard BigQuery pattern, the billing project doesn't have to match the
// data's project as long as IAM allows the read). See docs/deploy-commands.md.
export const APP_PROJECT = "sterlingx-insights";

// The pipeline data this app reads across all tracked pipelines (Offline
// Conversion's origin lead/conversion events/GAds tables, Waterfall
// Report's and Pacing Report's CRM/CTP trunk) lives here and stays here —
// none of it is owned by this dashboard. Pacing Report's own per-firm
// weekly-roundup tables and its combined final table are the one
// exception — those already live in APP_PROJECT (sterlingx-insights),
// see src/lib/pipelines/pacing-report.ts.
export const REPORT_PROJECT = "rc-datamart-report-082025";

export const bigquery = new BigQuery({ projectId: APP_PROJECT });

export async function tableExists(
  project: string,
  dataset: string,
  table: string,
): Promise<boolean> {
  const [rows] = await bigquery.query({
    query: `
      SELECT 1
      FROM \`${project}.${dataset}.INFORMATION_SCHEMA.TABLES\`
      WHERE table_name = @table
      LIMIT 1
    `,
    params: { table },
  });
  return rows.length > 0;
}
