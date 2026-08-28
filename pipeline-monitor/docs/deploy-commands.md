# Deploy commands — run these yourself, in order

All commands use the active `gcloud` account (`kmogatas@rocketclicks.com`).
Project: `rc-datamart-report-082025`, region: `us-central1`.

**Cross-project note:** `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and
`GMAIL_REFRESH_TOKEN` all live as Secret Manager secrets in a *different*
project — `sterlingx-insights` (project number `315627031`) — not
`rc-datamart-report-082025`. Gmail API was enabled there specifically. This
means two things later in this doc: the Cloud Run service account needs
`roles/secretmanager.secretAccessor` granted **in `sterlingx-insights`**,
not just its home project, and the `--set-secrets` flag must reference all
three by full resource path (`projects/315627031/secrets/<name>:latest`),
not by short name. `GMAIL_SENDER_ADDRESS` (`det@rocketclicks.com`) isn't
sensitive — it's a plain `--set-env-vars` entry, not a secret.

## 1. Create the BigQuery infra (dataset + tables)

Three DDL files now, all writing into the same `pipeline_monitoring`
dataset — run all three:

```bash
bq query --use_legacy_sql=false < pipeline-monitor/sql/offline_conversion_health_status.sql
bq query --use_legacy_sql=false < pipeline-monitor/sql/dashboard_users.sql
bq query --use_legacy_sql=false < pipeline-monitor/sql/dashboard_firm_config.sql
```

After `dashboard_users.sql` runs, follow `docs/first-admin-setup.md` to
create the first admin account — nothing in `/admin/*` is reachable until
that exists.

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

(This dataset now also holds `dashboard_users` and `dashboard_firm_config`
— the same Data Editor grant on the whole dataset already covers them, no
extra grant needed.)

(Or via `bq` CLI if yours works: `bq add-iam-policy-binding --member="serviceAccount:${SA_EMAIL}" --role="roles/bigquery.dataViewer" rc-datamart-report-082025:firms_origin_lead_table`, one per dataset.)

Do **not** grant `roles/bigquery.dataViewer` or `roles/editor` at the
project level — that would give this dashboard read access to every
dataset in the project, including client-sensitive data unrelated to
offline conversion.

### Grant Secret Manager access (two different projects)

For `NEXTAUTH_SECRET` and `CHECKUP_CRON_SECRET` (created in
`rc-datamart-report-082025`, see step 3 below):

```bash
gcloud secrets add-iam-policy-binding nextauth-secret \
  --project=rc-datamart-report-082025 \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding checkup-cron-secret \
  --project=rc-datamart-report-082025 \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"
```

For `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`,
which all live in **`sterlingx-insights`** (project number `315627031`) —
cross-project grant, `--project` here is the secret's project, not the
service's:

```bash
for secret in GMAIL_CLIENT_ID GMAIL_CLIENT_SECRET GMAIL_REFRESH_TOKEN; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --project=sterlingx-insights \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"
done
```

`GMAIL_SENDER_ADDRESS` (`det@rocketclicks.com`) isn't a secret — no grant
needed, it's set as a plain env var in step 3 below.

## 3. Deploy to Cloud Run (private — no public access)

```bash
gcloud run deploy rc-projects-systems-monitoring-dashboard \
  --source=pipeline-monitor \
  --project=rc-datamart-report-082025 \
  --region=us-central1 \
  --service-account="${SA_EMAIL}" \
  --no-allow-unauthenticated \
  --port=8080 \
  --set-env-vars="NEXTAUTH_URL=<fill in after first deploy, see note below>,GMAIL_SENDER_ADDRESS=det@rocketclicks.com" \
  --set-secrets="NEXTAUTH_SECRET=nextauth-secret:latest,CHECKUP_CRON_SECRET=checkup-cron-secret:latest,GMAIL_CLIENT_ID=projects/315627031/secrets/GMAIL_CLIENT_ID:latest,GMAIL_CLIENT_SECRET=projects/315627031/secrets/GMAIL_CLIENT_SECRET:latest,GMAIL_REFRESH_TOKEN=projects/315627031/secrets/GMAIL_REFRESH_TOKEN:latest"
```

The three `GMAIL_*` secrets use the full `projects/315627031/secrets/<name>:latest`
form because they live in `sterlingx-insights`, a different project than
this Cloud Run service — `--set-secrets` needs the full resource path to
reach across projects, a bare short name only resolves within the
deploying project. `GMAIL_SENDER_ADDRESS` is a plain env var, not a secret
— it's just an email address, nothing sensitive to protect.

The app now has a real login (NextAuth + the `dashboard_users` table — see
`docs/first-admin-setup.md` and `docs/gmail-api-setup.md`), but
`--no-allow-unauthenticated` should stay anyway: Cloud Run IAM plus
app-level login is defense in depth, not redundant — losing the Cloud Run
layer would still expose `/api/offline-conversion-checkup` to anyone with
the URL who also had `CHECKUP_CRON_SECRET` (only the scheduler should have
that secret, but two independent layers is safer than relying on one).

The `--set-secrets` flags assume you've created those six secrets in
Secret Manager first (`gcloud secrets create nextauth-secret --data-file=-`
etc., one per var) — do that before this deploy command, not after.
`NEXTAUTH_URL` has a bootstrapping wrinkle: you don't know the Cloud Run
URL until after the first deploy. Deploy once without it (or with a
placeholder), note the URL from the output, then re-run this same command
with the real URL — `gcloud run deploy` on an existing service name
updates it in place, it doesn't create a duplicate.

Access the deployed app yourself via:

```bash
gcloud run services proxy rc-projects-systems-monitoring-dashboard \
  --project=rc-datamart-report-082025 --region=us-central1
```

or by granting specific users `roles/run.invoker` on the service, then
sign in through `/login` for the app-level session (see
`docs/first-admin-setup.md` for the first account).

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

Replace `<DEPLOYED_URL>` with the URL from step 3's output. The scheduler's
OIDC token gets it past the Cloud Run IAM layer via the standard
`Authorization` header (handled automatically by `--oidc-service-account-email`
above); the app itself additionally needs `CHECKUP_CRON_SECRET` in a
separate `X-Checkup-Cron-Secret` header, since `Authorization` is already
spoken for by the Cloud Run layer. Add
`--headers="X-Checkup-Cron-Secret=<CHECKUP_CRON_SECRET value>"` to the
`gcloud scheduler jobs create http` command above.

## 5. Smoke test

```bash
curl -X POST "<DEPLOYED_URL>/api/offline-conversion-checkup" \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  -H "X-Checkup-Cron-Secret: <CHECKUP_CRON_SECRET value>"
```

Should return JSON with a per-firm verdict for the 10 active firms, and
write one snapshot row per firm into
`pipeline_monitoring.offline_conversion_health_status`. Confirm with:

```bash
bq query --use_legacy_sql=false \
  'SELECT firm, verdict, checked_at FROM `rc-datamart-report-082025.pipeline_monitoring.offline_conversion_health_status` ORDER BY checked_at DESC LIMIT 15'
```
