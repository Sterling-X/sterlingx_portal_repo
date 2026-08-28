import { BigQuery } from "@google-cloud/bigquery";

// Local dev: relies on Application Default Credentials
// (`gcloud auth application-default login`). Deployed (Cloud Run): needs a
// dedicated service account with BigQuery Data Viewer + Job User on
// `rc-datamart-report-082025` (and Data Editor scoped to the
// `pipeline_monitoring` dataset only, for the snapshot writes) — not yet
// provisioned. See docs/cron-setup.md.
const REPORT_PROJECT = "rc-datamart-report-082025";

export const bigquery = new BigQuery({ projectId: REPORT_PROJECT });

export async function tableExists(
  dataset: string,
  table: string,
): Promise<boolean> {
  const [rows] = await bigquery.query({
    query: `
      SELECT 1
      FROM \`${REPORT_PROJECT}.${dataset}.INFORMATION_SCHEMA.TABLES\`
      WHERE table_name = @table
      LIMIT 1
    `,
    params: { table },
  });
  return rows.length > 0;
}
