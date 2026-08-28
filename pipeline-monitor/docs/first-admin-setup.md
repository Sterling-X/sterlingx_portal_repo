# Bootstrapping the first admin account

There's a chicken-and-egg problem: `/admin/users` is how you create
accounts, but it's admin-only, and there's no admin yet on a fresh
deployment. This is a one-time manual step — insert the first admin row
directly, then use the app normally from there.

## 1. Run the DDL first

`sql/dashboard_users.sql` must already be applied (see
`docs/deploy-commands.md` step 1 — add this file to that same DDL pass).

## 2. Generate a bcrypt hash for the admin's password

```powershell
node -e "
const bcrypt = require('bcryptjs');
const password = process.argv[1];
bcrypt.hash(password, 12).then(hash => console.log(hash));
" 'choose-a-real-password-here'
```

Run this from inside `pipeline-monitor/` so the `bcryptjs` dependency
resolves. Copy the printed hash — you'll paste it into the query below.
**Do not commit this password or hash anywhere.**

## 3. Insert the row

Run in BigQuery Studio (or `bq query --use_legacy_sql=false`):

```sql
INSERT INTO `sterlingx-insights.pipeline_monitoring.dashboard_users`
  (user_id, name, email, password_hash, role, assigned_firms,
   is_active, reset_token_hash, reset_token_expires_at,
   created_at, updated_at)
VALUES
  (GENERATE_UUID(), 'Your Name', 'you@rocketclicks.com',
   '<paste the bcrypt hash from step 2>', 'admin', [],
   TRUE, NULL, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP());
```

## 4. Sign in

Go to `/login`, sign in with that email/password. From here, use
`/admin/users` to invite everyone else — they'll get a real invite email
via Gmail API instead of a hand-inserted row.
