import { google } from "googleapis";

// OAuth2 refresh-token flow (not domain-wide delegation) -- picked because
// it only needs one Workspace user to grant consent once via the OAuth
// playground/consent screen, rather than a Workspace admin enabling
// domain-wide delegation for a service account. See
// docs/gmail-api-setup.md for exact provisioning steps.
//
// Required env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET,
// GMAIL_REFRESH_TOKEN, GMAIL_SENDER_ADDRESS.

function getOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Gmail API not configured -- set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, " +
        "GMAIL_REFRESH_TOKEN. See docs/gmail-api-setup.md.",
    );
  }

  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function encodeMessage(params: {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
}): string {
  const message = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    params.bodyText,
  ].join("\r\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
): Promise<void> {
  const senderAddress = process.env.GMAIL_SENDER_ADDRESS;
  if (!senderAddress) {
    throw new Error(
      "GMAIL_SENDER_ADDRESS not set. See docs/gmail-api-setup.md.",
    );
  }

  const auth = getOAuth2Client();
  const gmail = google.gmail({ version: "v1", auth });

  const raw = encodeMessage({
    from: senderAddress,
    to: toEmail,
    subject: "Set your Pipeline Monitor password",
    bodyText: [
      "You were sent a link to set your password for the Offline Conversion",
      "Pipeline Monitor dashboard.",
      "",
      resetUrl,
      "",
      "This link expires in 1 hour. If you didn't expect this, you can",
      "ignore this email -- no account changes have been made.",
    ].join("\n"),
  });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}
