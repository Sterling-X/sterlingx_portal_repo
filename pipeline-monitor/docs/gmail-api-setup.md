# Gmail API setup — password reset / invite emails

The app sends password-reset and user-invite emails via the Gmail API using
an OAuth2 refresh token for one sending mailbox (e.g.
`pipeline-monitor@rocketclicks.com` or similar) — not a service account with
domain-wide delegation, which would need a Workspace admin to enable
delegation org-wide. This only needs that one mailbox's owner to grant
consent once.

## 1. Create OAuth client credentials

In the Google Cloud Console, project `rc-datamart-report-082025` (or
whichever project you want to own these credentials):

1. APIs & Services → Enabled APIs → enable **Gmail API**.
2. APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Desktop app** (simplest for a one-time manual
     consent flow — you don't need a web redirect URI for this).
   - Note the generated **Client ID** and **Client Secret** — these become
     `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET`.
3. OAuth consent screen: add the sending mailbox's address as a test user
   if the app is in Testing mode (fine for internal use — no need to
   publish/verify the app for a single internal mailbox).

## 2. Get a refresh token for the sending mailbox

Sign in to the mailbox you want emails to come from (e.g. via
`GMAIL_SENDER_ADDRESS`), then run this once from a machine with a browser
available, using the client ID/secret from step 1:

```bash
python3 -c "
from google_auth_oauthlib.flow import InstalledAppFlow
flow = InstalledAppFlow.from_client_config(
    {
        'installed': {
            'client_id': '<GMAIL_CLIENT_ID>',
            'client_secret': '<GMAIL_CLIENT_SECRET>',
            'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
            'token_uri': 'https://oauth2.googleapis.com/token',
        }
    },
    scopes=['https://www.googleapis.com/auth/gmail.send'],
)
creds = flow.run_local_server(port=0)
print('Refresh token:', creds.refresh_token)
"
```

(Requires `pip install google-auth-oauthlib` — a one-off local dependency,
not something the app needs at runtime.) This opens a browser, asks you to
sign in as the sending mailbox, and approve the `gmail.send` scope only —
minimum necessary, not full mailbox access. The printed refresh token
becomes `GMAIL_REFRESH_TOKEN`.

## 3. Set the env vars

On Cloud Run (see `docs/deploy-commands.md` step 3), or locally in
`.env.local` for dev:

```
GMAIL_CLIENT_ID=<from step 1>
GMAIL_CLIENT_SECRET=<from step 1>
GMAIL_REFRESH_TOKEN=<from step 2>
GMAIL_SENDER_ADDRESS=<the mailbox you authorized in step 2>
```

Treat all four as secrets — prefer Secret Manager + `--set-secrets` on the
`gcloud run deploy` command over plain `--set-env-vars`, matching how
`PIPELINE_HEALTH_CHECK_SECRET` etc. are handled in the AI-Projects
`client-data-validator` project.
