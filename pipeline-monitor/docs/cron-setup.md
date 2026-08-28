# Cloud Scheduler setup — Offline Conversion Pipeline Monitor

**Superseded by `docs/deploy-commands.md` step 4.** This file was the
original draft, written before the app had auth or a decided GCP project.
The current, accurate registration command (project `sterlingx-insights`,
including the `CHECKUP_CRON_SECRET` header the checkup route now requires)
lives there — use that, not this file.

## Alerting

Not built yet. The dashboard flags red/yellow status visually; email/Slack
notification on a status change is deferred — see the `TODO` in
`src/app/api/offline-conversion-checkup/route.ts`.
