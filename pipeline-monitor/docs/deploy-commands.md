# Deploy commands — run these yourself, in order

All commands use PowerShell and the active `gcloud` account
(`kmogatas@rocketclicks.com`).

**Project split:** the app's own hosting/state — Cloud Run service, service
account, and the `pipeline_monitoring` dataset (`dashboard_users`,
`dashboard_firm_config`, `offline_conversion_health_status`) — all live in
**`sterlingx-insights`** (project number `315627031`), region
`us-central1`. Gmail API is already enabled there and the three
`GMAIL_*` secrets already exist there — same project, no more cross-project
secret grants needed. The actual pipeline data this app *reads*
(`firms_origin_lead_table`, conversion events, GAds export logs, validation
tables) stays where it's always been, in **`rc-datamart-report-082025`** —
that data isn't owned by this app and doesn't move. This is a completely
standard BigQuery pattern: the service account's home/billing project runs
the query jobs, and cross-project reads just need IAM, not the same project.

## 0. Clean up the earlier rc-datamart-report-082025 attempt

Before this app was pointed at `sterlingx-insights`, an empty
`pipeline_monitoring` dataset (3 unused tables) and a
`rc-monitor-dashboard` service account were created in
`rc-datamart-report-082025`. Nothing was ever deployed against them.
Delete both:

```powershell
bq rm -r -f -d rc-datamart-report-082025:pipeline_monitoring

gcloud iam service-accounts delete `
  rc-monitor-dashboard@rc-datamart-report-082025.iam.gserviceaccount.com `
  --project=rc-datamart-report-082025 --quiet
```

If your local `bq` CLI is broken (it was, in the environment this was
written in — a Python `absl.flags` import error), delete the dataset from
BigQuery Studio instead: select `rc-datamart-report-082025` →
`pipeline_monitoring` → the three-dot menu → Delete.

## 1. Create the BigQuery infra (dataset + tables) — in sterlingx-insights

```powershell
bq query --use_legacy_sql=false < pipeline-monitor/sql/offline_conversion_health_status.sql
bq query --use_legacy_sql=false < pipeline-monitor/sql/dashboard_users.sql
bq query --use_legacy_sql=false < pipeline-monitor/sql/dashboard_firm_config.sql
```

(If `bq` doesn't work locally, paste each file's contents into BigQuery
Studio → project `sterlingx-insights` → new query, and run it there
instead. All three are idempotent — `CREATE SCHEMA IF NOT EXISTS` /
`CREATE TABLE IF NOT EXISTS` — safe to run once, safe to re-run.)

After `dashboard_users.sql` runs, follow `docs/first-admin-setup.md` to
create the first admin account — nothing in `/admin/*` is reachable until
that exists.

Verify: `pipeline_monitoring.offline_conversion_health_status` should exist
under `sterlingx-insights` with 0 rows.

## 2. Create the dedicated service account (least privilege) — in sterlingx-insights

```powershell
gcloud iam service-accounts create rc-monitor-dashboard `
  --project=sterlingx-insights `
  --display-name="Offline-conversion pipeline monitoring dashboard"

$SA_EMAIL = "rc-monitor-dashboard@sterlingx-insights.iam.gserviceaccount.com"

# Query-execution permission (project-level, required for any BQ job) --
# home project, so it can also run cross-project reads against
# rc-datamart-report-082025 below.
gcloud projects add-iam-policy-binding sterlingx-insights `
  --member="serviceAccount:$SA_EMAIL" `
  --role="roles/bigquery.jobUser"
```

Then grant **dataset-level** (not project-level) access — read-only on the
four datasets this app reads (still in `rc-datamart-report-082025`), and
write access on just its own dataset (now in `sterlingx-insights`). Easiest
done in BigQuery Studio: for each dataset below, open Sharing → Permissions
→ Add Principal → paste the SA email → assign the listed role:

| Project | Dataset | Role |
|---|---|---|
| `rc-datamart-report-082025` | `firms_origin_lead_table` | BigQuery Data Viewer |
| `rc-datamart-report-082025` | `firms_origin_conversion_events` | BigQuery Data Viewer |
| `rc-datamart-report-082025` | `gads_export_logs` | BigQuery Data Viewer |
| `rc-datamart-report-082025` | `gads_validation_table` | BigQuery Data Viewer |
| `sterlingx-insights` | `pipeline_monitoring` | BigQuery Data Editor |

(This dataset now also holds `dashboard_users` and `dashboard_firm_config`
— the same Data Editor grant on the whole dataset already covers them, no
extra grant needed.)

(Or via `bq` CLI if yours works, one per read-only dataset:
```powershell
bq add-iam-policy-binding --member="serviceAccount:$SA_EMAIL" --role="roles/bigquery.dataViewer" rc-datamart-report-082025:firms_origin_lead_table
```
)

Do **not** grant `roles/bigquery.dataViewer` or `roles/editor` at the
project level on `rc-datamart-report-082025` — that would give this
dashboard read access to every dataset in that project, including
client-sensitive data unrelated to offline conversion.

### Grant Secret Manager access — all in sterlingx-insights now

`NEXTAUTH_SECRET`, `CHECKUP_CRON_SECRET`, and all three `GMAIL_*` secrets
now live in the same project as the service account — no cross-project
grants needed, unlike the earlier draft of this doc:

```powershell
foreach ($secret in @("nextauth-secret", "checkup-cron-secret", "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN")) {
  gcloud secrets add-iam-policy-binding $secret `
    --project=sterlingx-insights `
    --member="serviceAccount:$SA_EMAIL" `
    --role="roles/secretmanager.secretAccessor"
}
```

(`nextauth-secret`/`checkup-cron-secret` need creating first if they don't
exist yet — see step 3.)

`GMAIL_SENDER_ADDRESS` (`det@rocketclicks.com`) isn't a secret — no grant
needed, it's set as a plain env var in step 3 below.

## 3. Deploy to Cloud Run (private — no public access) — in sterlingx-insights

If `nextauth-secret` and `checkup-cron-secret` don't exist yet in Secret
Manager, create them first:

```powershell
$nextAuthSecret = openssl rand -base64 32
$nextAuthSecret | gcloud secrets create nextauth-secret --project=sterlingx-insights --data-file=-

$checkupCronSecret = openssl rand -base64 32
$checkupCronSecret | gcloud secrets create checkup-cron-secret --project=sterlingx-insights --data-file=-
```

Then deploy:

```powershell
gcloud run deploy rc-projects-systems-monitoring-dashboard `
  --source=pipeline-monitor `
  --project=sterlingx-insights `
  --region=us-central1 `
  --service-account="$SA_EMAIL" `
  --no-allow-unauthenticated `
  --port=8080 `
  --set-env-vars="NEXTAUTH_URL=<fill in after first deploy, see note below>,GMAIL_SENDER_ADDRESS=det@rocketclicks.com" `
  --set-secrets="NEXTAUTH_SECRET=nextauth-secret:latest,CHECKUP_CRON_SECRET=checkup-cron-secret:latest,GMAIL_CLIENT_ID=GMAIL_CLIENT_ID:latest,GMAIL_CLIENT_SECRET=GMAIL_CLIENT_SECRET:latest,GMAIL_REFRESH_TOKEN=GMAIL_REFRESH_TOKEN:latest"
```

All secrets now use short names (no `projects/315627031/secrets/...` full
path needed) since the Cloud Run service and every secret it reads are all
in `sterlingx-insights`.

The app has a real login (NextAuth + the `dashboard_users` table — see
`docs/first-admin-setup.md` and `docs/gmail-api-setup.md`), but
`--no-allow-unauthenticated` should stay anyway: Cloud Run IAM plus
app-level login is defense in depth, not redundant — losing the Cloud Run
layer would still expose `/api/offline-conversion-checkup` to anyone with
the URL who also had `CHECKUP_CRON_SECRET` (only the scheduler should have
that secret, but two independent layers is safer than relying on one).

`NEXTAUTH_URL` has a bootstrapping wrinkle: you don't know the Cloud Run
URL until after the first deploy. Deploy once without it (or with a
placeholder), note the URL from the output, then re-run this same command
with the real URL — `gcloud run deploy` on an existing service name
updates it in place, it doesn't create a duplicate.

Access the deployed app yourself via:

```powershell
gcloud run services proxy rc-projects-systems-monitoring-dashboard `
  --project=sterlingx-insights --region=us-central1
```

or by granting specific users `roles/run.invoker` on the service, then
sign in through `/login` for the app-level session (see
`docs/first-admin-setup.md` for the first account).

Note the deployed URL from the command output — you'll need it for step 4.

## 4. Register the daily 9AM ET Cloud Scheduler job — in sterlingx-insights

The scheduler needs its own identity with `roles/run.invoker` on the
service (reuse the same SA, or create a separate one — reusing is fine
here since it's the same trust boundary):

```powershell
gcloud run services add-iam-policy-binding rc-projects-systems-monitoring-dashboard `
  --project=sterlingx-insights `
  --region=us-central1 `
  --member="serviceAccount:$SA_EMAIL" `
  --role="roles/run.invoker"

gcloud scheduler jobs create http offline-conversion-daily-check `
  --project=sterlingx-insights `
  --location=us-central1 `
  --schedule="0 9 * * *" `
  --time-zone="America/New_York" `
  --uri="<DEPLOYED_URL>/api/offline-conversion-checkup" `
  --http-method=POST `
  --oidc-service-account-email="$SA_EMAIL" `
  --oidc-token-audience="<DEPLOYED_URL>" `
  --headers="X-Checkup-Cron-Secret=<CHECKUP_CRON_SECRET value>"
```

Replace `<DEPLOYED_URL>` with the URL from step 3's output, and
`<CHECKUP_CRON_SECRET value>` with the value you generated in step 3. The
scheduler's OIDC token gets it past the Cloud Run IAM layer via the
standard `Authorization` header (handled automatically by
`--oidc-service-account-email` above); the app itself additionally needs
`CHECKUP_CRON_SECRET` in a separate `X-Checkup-Cron-Secret` header, since
`Authorization` is already spoken for by the Cloud Run layer.

## 5. Smoke test

```powershell
$identityToken = gcloud auth print-identity-token
curl.exe -X POST "<DEPLOYED_URL>/api/offline-conversion-checkup" `
  -H "Authorization: Bearer $identityToken" `
  -H "X-Checkup-Cron-Secret: <CHECKUP_CRON_SECRET value>"
```

Should return JSON with a per-firm verdict for the 10 active firms, and
write one snapshot row per firm into
`pipeline_monitoring.offline_conversion_health_status`. Confirm with:

```powershell
bq query --use_legacy_sql=false `
  'SELECT firm, verdict, checked_at FROM `sterlingx-insights.pipeline_monitoring.offline_conversion_health_status` ORDER BY checked_at DESC LIMIT 15'
```
