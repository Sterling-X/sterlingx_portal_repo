# Offline Conversion Pipeline Monitor

Tracks whether each firm's Offline Conversion pipeline (CRM/call-tracking/webhook →
`genesis_crm_universal_table` → origin lead table → origin conversion events →
Google Ads Data Manager uploads) is flowing correctly, end to end.

## Tracked accounts

- **Active** (10): johnson, meyerpink, auritmediation, lancaster, cutrer,
  kalishandjaggars, fanash, haffner, ireland, smb — see `src/lib/accounts.ts`
- **Paused** (3, manual fix in progress, not checked): tde, vdl, slo

## Local dev

```bash
pnpm install
gcloud auth application-default login   # BigQuery read access
pnpm dev
```

Open http://localhost:3000 and click "Check Now."

## Deploy

Not yet deployed. See `docs/cron-setup.md` for the Cloud Run + Cloud Scheduler
setup once a GCP project/service is provisioned.

## Data model

`POST /api/offline-conversion-checkup` runs the reconciliation across the 10
active firms and (if the table exists) writes one snapshot row per firm to
`rc-datamart-report-082025.pipeline_monitoring.offline_conversion_health_status`
— DDL in `sql/offline_conversion_health_status.sql`, marked PENDING HUMAN
REVIEW, not yet applied.
