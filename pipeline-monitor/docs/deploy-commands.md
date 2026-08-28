# Deploy commands — run these yourself, in order

All commands use the active `gcloud` account (`kmogatas@rocketclicks.com`).
Project: `rc-datamart-report-082025`, region: `us-central1`.

## 1. Create the BigQuery infra (dataset + snapshot table)

The DDL is already written and reviewed: `pipeline-monitor/sql/offline_conversion_health_status.sql`.

```bash
bq query --use_legacy_sql=false < pipeline-monitor/sql/offline_conversion_health_status.sql
```

If your local `bq` CLI is broken (it is, in this environment — a Python
`absl.flags` import error), run it from the BigQuery Studio console instead:
paste the contents of that `.sql` file into a new query and run it. It's
idempotent (`CREATE SCHEMA IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`),
safe to run once and safe to re-run.

Verify: `pipeline_monitoring.offline_conversion_health_status` should exist
under `rc-datamart-report-082025` with 0 rows.

## 2. Create the dedicated service account (least privilege)

```bash
gcloud iam service-accounts create rc-monitor-dashboard \
  --project=rc-datamart-report-082025 \
  --display-name="Offline-conversion pipeline monitoring dashboard"

SA_EMAIL="rc-monitor-dashboard@rc-datamart-report-082025.iam.gserviceaccount.com"

# Query-execution permission (project-level, required for any BQ job)
gcloud projects add-iam-policy-binding rc-datamart-report-082025 \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.jobUser"
```

Then grant **dataset-level** (not project-level) read access to just the
four datasets it reads, and write access to just the new one — this keeps
the service account from being able to touch anything outside its actual
scope. Easiest done in BigQuery Studio: for each dataset below, open
Sharing → Permissions → Add Principal → paste the SA email → assign the
listed role:

| Dataset | Role |
|---|---|
| `rc-datamart-report-082025.firms_origin_lead_table` | BigQuery Data Viewer |
| `rc-datamart-report-082025.firms_origin_conversion_events` | BigQuery Data Viewer |
| `rc-datamart-report-082025.gads_export_logs` | BigQuery Data Viewer |
| `rc-datamart-report-082025.gads_validation_table` | BigQuery Data Viewer |
| `rc-datamart-report-082025.pipeline_monitoring` | BigQuery Data Editor |

(Or via `bq` CLI if yours works: `bq add-iam-policy-binding --member="serviceAccount:${SA_EMAIL}" --role="roles/bigquery.dataViewer" rc-datamart-report-082025:firms_origin_lead_table`, one per dataset.)

Do **not** grant `roles/bigquery.dataViewer` or `roles/editor` at the
project level — that would give this dashboard read access to every
dataset in the project, including client-sensitive data unrelated to
offline conversion.

## 3. Deploy to Cloud Run (private — no public access)

```bash
gcloud run deploy rc-projects-systems-monitoring-dashboard \
  --source=pipeline-monitor \
  --project=rc-datamart-report-082025 \
  --region=us-central1 \
  --service-account="${SA_EMAIL}" \
  --no-allow-unauthenticated \
  --port=8080
```

This app has **no auth layer built in** (no Clerk/Auth0/Identity Platform —
confirmed, not an oversight in this doc). `--no-allow-unauthenticated` is
required, not optional: without it, anyone with the URL could see internal
pipeline health data for every tracked firm. Access it yourself via:

```bash
gcloud run services proxy rc-projects-systems-monitoring-dashboard \
  --project=rc-datamart-report-082025 --region=us-central1
```

or by granting specific users `roles/run.invoker` on the service. Adding a
real auth layer (matching how `client-performance-dashboard` uses
Auth0/Identity Platform) is a follow-up, not done here.

Note the deployed URL from the command output — you'll need it for step 4.

## 4. Register the daily 9AM ET Cloud Scheduler job

The scheduler needs its own identity with `roles/run.invoker` on the
service (reuse the same SA, or create a separate one — reusing is fine
here since it's the same trust boundary):

```bash
gcloud run services add-iam-policy-binding rc-projects-systems-monitoring-dashboard \
  --project=rc-datamart-report-082025 \
  --region=us-central1 \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.invoker"

gcloud scheduler jobs create http offline-conversion-daily-check \
  --project=rc-datamart-report-082025 \
  --location=us-central1 \
  --schedule="0 9 * * *" \
  --time-zone="America/New_York" \
  --uri="<DEPLOYED_URL>/api/offline-conversion-checkup" \
  --http-method=POST \
  --oidc-service-account-email="${SA_EMAIL}" \
  --oidc-token-audience="<DEPLOYED_URL>"
```

Replace `<DEPLOYED_URL>` with the URL from step 3's output.

## 5. Smoke test

```bash
curl -X POST "<DEPLOYED_URL>/api/offline-conversion-checkup" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)"
```

Should return JSON with a per-firm verdict for the 10 active firms, and
write one snapshot row per firm into
`pipeline_monitoring.offline_conversion_health_status`. Confirm with:

```bash
bq query --use_legacy_sql=false \
  'SELECT firm, verdict, checked_at FROM `rc-datamart-report-082025.pipeline_monitoring.offline_conversion_health_status` ORDER BY checked_at DESC LIMIT 15'
```
