# Cloud Scheduler setup — Offline Conversion Pipeline Monitor

**Status: documented, not registered.** No GCP project/Cloud Run service exists yet for
this app. Do not run this until the app is deployed.

## Prerequisites
1. Deploy `pipeline-monitor/` to Cloud Run (needs its own service, separate from
   `client-data-validator`/`client-performance-dashboard` in AI-Projects).
2. Provision a dedicated service account with:
   - BigQuery Data Viewer + Job User on `rc-datamart-report-082025`
   - BigQuery Data Editor scoped to the `pipeline_monitoring` dataset only (for snapshot writes)
   - Read access to `firms_origin_lead_table`, `firms_origin_conversion_events`,
     `gads_export_logs`, `gads_validation_table` datasets
3. Run `sql/offline_conversion_health_status.sql` against BigQuery (currently marked
   PENDING HUMAN REVIEW — review before applying).
4. Set the deployed Cloud Run service to allow invocation from Cloud Scheduler
   (either an OIDC token from a scheduler-specific service account, or an
   internal-only ingress + authenticated invoker — pick whichever matches how
   `client-data-validator`'s cron is set up in AI-Projects, for consistency).

## Register the daily job

`--time-zone="America/New_York"` handles the EST/EDT switch automatically —
9AM ET stays 9AM ET year-round without a manual DST adjustment.

```bash
gcloud scheduler jobs create http offline-conversion-checkup \
  --location=us-central1 \
  --schedule="0 9 * * *" \
  --time-zone="America/New_York" \
  --uri="https://<deployed-cloud-run-url>/api/offline-conversion-checkup" \
  --http-method=POST \
  --oidc-service-account-email="<scheduler-invoker-sa>@<project>.iam.gserviceaccount.com" \
  --oidc-token-audience="https://<deployed-cloud-run-url>"
```

## Alerting

Not built yet. The dashboard flags red/yellow status visually; email/Slack
notification on a status change is deferred — see the `TODO` in
`src/app/api/offline-conversion-checkup/route.ts`.
