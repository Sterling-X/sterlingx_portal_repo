import { BigQuery } from "@google-cloud/bigquery";

// The app's own hosting/billing project. Query jobs run here, and this is
// where dashboard_users/dashboard_firm_config/offline_conversion_health_status
// live — the app's own state, as opposed to the pipeline data it reads.
// Local dev: relies on Application Default Credentials
// (`gcloud auth application-default login`). Deployed (Cloud Run): needs a
// dedicated service account with BigQuery Job User here, Data Editor scoped
// to the `pipeline_monitoring` dataset here, and Data Viewer scoped to the
// four read-only datasets in REPORT_PROJECT below (cross-project read —
// standard BigQuery pattern, the billing project doesn't have to match the
// data's project as long as IAM allows the read). See docs/deploy-commands.md.
export const APP_PROJECT = "sterlingx-insights";

// The pipeline data this app reads (firms_origin_lead_table, conversion
// events, GAds export logs, validation tables) lives here and stays here —
// it's owned by the offline-conversion pipeline, not this dashboard.
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
