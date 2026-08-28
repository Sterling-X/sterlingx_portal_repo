# Auth0 setup — this app

One-time, manual — nothing here can be done from this environment (no
Auth0 API credentials exist yet, and creating them is exactly what this
doc walks through). Follow AI-Projects' `docs/auth0-setup.md` for the
general per-project pattern; this file is the exact version of that
checklist for this app specifically.

Tenant: `dev-ydfs61vssild4nxt.us.auth0.com` (shared across every SterlingX
app — this app registers its own Application in it, not a new tenant).

## 1. Create this app's Auth0 Application

Auth0 Dashboard → **Applications** → **Create Application** → **Regular
Web Application**.

- **Name:** `SterlingX — Offline Conversion Pipeline Monitor`
- **Allowed Callback URLs:** `http://localhost:3000/api/auth/callback` (add
  the deployed Cloud Run URL's equivalent once it exists —
  `https://<deployed-url>/api/auth/callback`)
- **Allowed Logout URLs:** `http://localhost:3000` (and the deployed URL)
- **Allowed Web Origins:** `http://localhost:3000` (and the deployed URL)

Note the **Client ID** → `AUTH0_CLIENT_ID`. Note the **Client Secret** →
`AUTH0_CLIENT_SECRET` (Secret Manager on deploy, `.env.local` for dev —
never commit it).

## 2. Create this app's Auth0 API (audience)

Auth0 Dashboard → **Applications → APIs** → **Create API**.

- **Name:** `SterlingX API — Offline Conversion Pipeline Monitor`
- **Identifier (Audience):** the deployed Cloud Run URL + `/api` (e.g.
  `https://rc-projects-systems-monitoring-dashboard-<hash>.us-central1.run.app/api`)
  — for local dev this can stay whatever the eventual production value is,
  the audience identifier doesn't have to resolve to anything real
- **Signing Algorithm:** RS256

Note the **Identifier** → `AUTH0_AUDIENCE`.

## 3. Create the three roles (if they don't already exist in this tenant)

Auth0 Dashboard → **User Management** → **Roles** → **Create Role**, three
times:

| Role | Meaning in this app |
|---|---|
| `admin` | Full access, including `/admin/users` and `/admin/config` |
| `developer` | Full pipeline-data access, no user/config management |
| `user` | Only sees firms listed in their `assigned_firms` (`app_metadata`) |

If `client-performance-dashboard` or another SterlingX app already created
an `admin` role in this tenant, reuse it — role names are shared across
apps, and the "Add Roles to Token" Action (already deployed, see
AI-Projects `docs/auth0-setup.md` §5) injects whatever roles a user has
into every app's token via the same `https://sterlingx.com/roles` claim.
Only create `developer` and `user` if they're genuinely new to this
tenant — check before assuming.

## 4. Authorize this app for the Management API

`src/server/auth0-mgmt.ts` needs a client-credentials grant against this
tenant's Management API (`https://dev-ydfs61vssild4nxt.us.auth0.com/api/v2/`)
using this app's own Client ID/Secret from step 1 — not a separate M2M
application, the same Regular Web Application, authorized for a second
audience.

Auth0 Dashboard → **Applications → APIs** → **Auth0 Management API** →
**Machine to Machine Applications** tab → find this app → toggle
Authorized → expand it → grant exactly these scopes (least privilege, not
"select all"):

- `read:users`
- `update:users`
- `read:roles`
- `read:role_members`
- `create:role_members`
- `delete:role_members`

## 5. Grant yourself the `admin` role

Auth0 Dashboard → **User Management** → **Users** → your account (or sign
up via `/api/auth/login` first if you don't have an account in this tenant
yet) → **Roles** tab → **Assign Roles** → `admin`.

This is the only way in — there's no BigQuery-row bootstrap step like the
custom login system had. Once you have the `admin` role, `/admin/users`
works normally for everyone else.

## 6. Set the env vars

Local dev (`.env.local`, never committed) or Cloud Run deploy (see
`docs/deploy-commands.md`):

```
AUTH0_SECRET=<openssl rand -hex 32>
AUTH0_BASE_URL=http://localhost:3000            # or the deployed Cloud Run URL
AUTH0_ISSUER_BASE_URL=https://dev-ydfs61vssild4nxt.us.auth0.com
AUTH0_CLIENT_ID=<from step 1>
AUTH0_CLIENT_SECRET=<from step 1>
AUTH0_AUDIENCE=<from step 2>
CHECKUP_CRON_SECRET=<any long random string>
```

## Sign-in / sign-out routes (provided by the SDK, nothing to build)

- `/api/auth/login` — redirects to Auth0's hosted Universal Login (handles
  sign-in, sign-up if enabled, and password reset natively — none of that
  is custom code in this app)
- `/api/auth/logout` — clears the session
- `/api/auth/callback` — the OAuth callback, matches the Allowed Callback
  URL from step 1
