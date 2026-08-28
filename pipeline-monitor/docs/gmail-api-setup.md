# Gmail API setup — password reset / invite emails

The app sends password-reset and user-invite emails via the Gmail API using
an OAuth2 refresh token for one sending mailbox (e.g.
`pipeline-monitor@rocketclicks.com` or similar) — not a service account with
domain-wide delegation, which would need a Workspace admin to enable
delegation org-wide. This only needs that one mailbox's owner to grant
consent once.

## 1. Create OAuth client credentials — done

Gmail API is enabled in project **`sterlingx-insights`** (project number
`315627031`), and `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` already exist
there as Secret Manager secrets. (`deploy-commands.md` has the
cross-project `--set-secrets`/IAM-grant details for referencing these from
the Cloud Run service, which lives in a different project,
`rc-datamart-report-082025`.)

If the OAuth consent screen for this client hasn't had `det@rocketclicks.com`
added as a test user yet (only needed if the app is in Testing mode),
do that now in Google Cloud Console → `sterlingx-insights` → APIs &
Services → OAuth consent screen, before running step 2 below.

## 2. Get a refresh token for the sending mailbox

Sending mailbox: **`det@rocketclicks.com`** (`GMAIL_SENDER_ADDRESS`).

First, install the one-off local dependency this script needs:

```bash
pip install google-auth-oauthlib
```

Then, signed in as `det@rocketclicks.com` in your default browser, run this
once — replace `<GMAIL_CLIENT_ID>`/`<GMAIL_CLIENT_SECRET>` with the actual
values from the `GMAIL_CLIENT_ID`/`GMAIL_CLIENT_SECRET` secrets already
created in `sterlingx-insights` (Secret Manager → the secret → "Access
latest version"; don't paste these into any committed file):

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

This opens a browser, asks you to
sign in as the sending mailbox, and approve the `gmail.send` scope only —
minimum necessary, not full mailbox access. The printed refresh token
becomes `GMAIL_REFRESH_TOKEN`.

## 3. Set the env vars — done

All three secrets now exist in Secret Manager under `sterlingx-insights`
(project `315627031`):

- `projects/315627031/secrets/GMAIL_CLIENT_ID`
- `projects/315627031/secrets/GMAIL_CLIENT_SECRET`
- `projects/315627031/secrets/GMAIL_REFRESH_TOKEN`

`GMAIL_SENDER_ADDRESS=det@rocketclicks.com` is set as a plain env var
(not a secret — just an email address, nothing sensitive). See
`docs/deploy-commands.md` step 2 (cross-project `secretAccessor` grants)
and step 3 (the actual `gcloud run deploy` command with all of this wired
in) for the exact commands.
