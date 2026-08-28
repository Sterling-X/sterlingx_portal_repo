# Deploy commands — run these yourself, in order

All commands use PowerShell and the active `gcloud` account
(`kmogatas@rocketclicks.com`).

**Project split:** the app's own hosting/state — Cloud Run service, service
account, and the `pipeline_monitoring` dataset (`dashboard_firm_config`,
`pipeline_health_status`) — all live in **`sterlingx-insights`**
(project number `315627031`), region `us-central1`. The actual pipeline
data this app *reads* (`firms_origin_lead_table`, conversion events, GAds
export logs, validation tables) stays where it's always been, in
**`rc-datamart-report-082025`** — that data isn't owned by this app and
doesn't move. This is a completely standard BigQuery pattern: the service
account's home/billing project runs the query jobs, and cross-project reads
just need IAM, not the same project.

**Auth:** login/roles/password-reset are handled by Auth0 (SterlingX's
standard pattern, see `docs/auth0-app-setup.md`) — there's no
`dashboard_users` table and no Gmail API dependency for this app. Complete
`docs/auth0-app-setup.md` before deploying; the deploy command below
needs its output (`AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_AUDIENCE`).

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
bq query --use_legacy_sql=false < pipeline-monitor/sql/pipeline_health_status.sql
bq query --use_legacy_sql=false < pipeline-monitor/sql/dashboard_firm_config.sql
```

(If `bq` doesn't work locally, paste each file's contents into BigQuery
Studio → project `sterlingx-insights` → new query, and run it there
instead. Both are idempotent — `CREATE SCHEMA IF NOT EXISTS` /
`CREATE TABLE IF NOT EXISTS` — safe to run once, safe to re-run.)

Verify: `pipeline_monitoring.pipeline_health_status` should exist
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

**Actual current grants (as of the Waterfall/Pacing generalization — already
applied, not just planned):**

```powershell
$SA = "serviceAccount:$SA_EMAIL"

# focused-sentry-464713-u0 — raw CRM/CT/webhook sources across every firm and
# pipeline; project-level rather than dataset-scoped because this project
# holds dozens of per-firm datasets and re-granting per new firm/pipeline
# doesn't scale. Broader than the pattern below, deliberately.
gcloud projects add-iam-policy-binding focused-sentry-464713-u0 `
  --member=$SA --role="roles/bigquery.dataViewer"
gcloud projects add-iam-policy-binding focused-sentry-464713-u0 `
  --member=$SA --role="roles/dataform.viewer"

# rc-datamart-report-082025 — same project-level tradeoff (Offline
# Conversion's 4 datasets, Waterfall/Pacing's shared CTP trunk, and future
# pipelines' tables all live here under datasets not enumerated up front).
gcloud projects add-iam-policy-binding rc-datamart-report-082025 `
  --member=$SA --role="roles/bigquery.dataViewer"
gcloud projects add-iam-policy-binding rc-datamart-report-082025 `
  --member=$SA --role="roles/dataform.viewer"

# sterlingx-insights — Dataform read (BigQuery access here is the
# jobUser + pipeline_monitoring Data Editor grants above/below already)
gcloud projects add-iam-policy-binding sterlingx-insights `
  --member=$SA --role="roles/dataform.viewer"
```

This is broader than the dataset-scoped least-privilege pattern originally
planned for `rc-datamart-report-082025` (four specific datasets) — that
narrower version is what you'd want if this app only ever covered Offline
Conversion. With three pipelines now and more planned, project-level
`bigquery.dataViewer` was chosen deliberately over re-granting per dataset
every time a new firm or pipeline is added. Confirmed intentional.

Still needed — a write grant, `sterlingx-insights.pipeline_monitoring`,
Data Editor scoped to just that dataset (this one stays narrow, it's this
app's own state, not read-only source data):

```powershell
# In BigQuery Studio: sterlingx-insights → pipeline_monitoring dataset →
# Sharing → Permissions → Add Principal → rc-monitor-dashboard@... →
# BigQuery Data Editor
```

The `roles/dataform.viewer` grants above are **read-only** — they support
each pipeline's future diagnostic page reading `.sqlx` source to explain a
failure. No write/commit access to any Dataform repository has been
granted anywhere — that's a separate, much bigger decision (Phase 3,
"Apply & Commit") not made yet.

### Grant Secret Manager access — in sterlingx-insights

`AUTH0_SECRET`, `AUTH0_CLIENT_SECRET`, and `CHECKUP_CRON_SECRET` are
sensitive; live in Secret Manager in `sterlingx-insights` (same project as
the service account):

```powershell
foreach ($secret in @("auth0-secret", "auth0-client-secret", "checkup-cron-secret")) {
  gcloud secrets add-iam-policy-binding $secret `
    --project=sterlingx-insights `
    --member="serviceAccount:$SA_EMAIL" `
    --role="roles/secretmanager.secretAccessor"
}
```

(These three need creating first if they don't exist yet — see step 3.)

`AUTH0_BASE_URL`, `AUTH0_ISSUER_BASE_URL`, `AUTH0_CLIENT_ID`, and
`AUTH0_AUDIENCE` aren't secrets — no grant needed, they're set as plain
env vars in step 3 below.

## 3. Deploy to Cloud Run (private — no public access) — in sterlingx-insights

Complete `docs/auth0-app-setup.md` first — the deploy command below needs
`AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and `AUTH0_AUDIENCE` from it.

If `auth0-secret`, `auth0-client-secret`, and `checkup-cron-secret` don't
exist yet in Secret Manager, create them first:

```powershell
$auth0Secret = openssl rand -hex 32
$auth0Secret | gcloud secrets create auth0-secret --project=sterlingx-insights --data-file=-

# <AUTH0_CLIENT_SECRET value> from docs/auth0-app-setup.md step 1
"<AUTH0_CLIENT_SECRET value>" | gcloud secrets create auth0-client-secret --project=sterlingx-insights --data-file=-

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
  --set-env-vars="AUTH0_BASE_URL=<fill in after first deploy, see note below>,AUTH0_ISSUER_BASE_URL=https://dev-ydfs61vssild4nxt.us.auth0.com,AUTH0_CLIENT_ID=<from docs/auth0-app-setup.md step 1>,AUTH0_AUDIENCE=<from docs/auth0-app-setup.md step 2>" `
  --set-secrets="AUTH0_SECRET=auth0-secret:latest,AUTH0_CLIENT_SECRET=auth0-client-secret:latest,CHECKUP_CRON_SECRET=checkup-cron-secret:latest"
```

`--no-allow-unauthenticated` should stay even with Auth0 login in place:
Cloud Run IAM plus app-level login is defense in depth, not redundant —
losing the Cloud Run layer would still expose
`/api/offline-conversion-checkup` to anyone with the URL who also had
`CHECKUP_CRON_SECRET` (only the scheduler should have that secret, but two
independent layers is safer than relying on one).

`AUTH0_BASE_URL` has a bootstrapping wrinkle: you don't know the Cloud Run
URL until after the first deploy, and Auth0's Allowed Callback/Logout/Web
Origin URLs (`docs/auth0-app-setup.md` step 1) also need it. Deploy once
with a placeholder, note the URL from the output, add it to the Auth0
Application's allowed URLs, then re-run this same command with the real
value — `gcloud run deploy` on an existing service name updates it in
place, it doesn't create a duplicate.

Access the deployed app yourself via:

```powershell
gcloud run services proxy rc-projects-systems-monitoring-dashboard `
  --project=sterlingx-insights --region=us-central1
```

or by granting specific users `roles/run.invoker` on the service, then
sign in through `/api/auth/login` (see `docs/auth0-app-setup.md` for
granting yourself the first `admin` role).

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
`pipeline_monitoring.pipeline_health_status`. Confirm with:

```powershell
bq query --use_legacy_sql=false `
  'SELECT pipeline_key, firm, verdict, checked_at FROM `sterlingx-insights.pipeline_monitoring.pipeline_health_status` ORDER BY checked_at DESC LIMIT 15'
```

This smoke test targets `/api/offline-conversion-checkup` (an alias for
`/api/checkup/offline_conversion` — see that route file), which is still
the one wired to the Cloud Scheduler job in step 4. Waterfall Report and
Pacing Report use `/api/checkup/waterfall_report` and
`/api/checkup/pacing_report` respectively — same auth shape, not yet
wired to their own scheduler jobs (only Offline Conversion's daily job
was set up this session; register the other two the same way once
they're ready to run unattended).
