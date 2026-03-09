/**
 * app/api/integrations/oauth/gmail/start/route.ts
 * GET — initiates the Google / Gmail OAuth 2.0 authorization flow.
 *
 * Generates a cryptographically random CSRF state, stores it in a short-lived
 * httpOnly cookie, then redirects the browser to Google's consent screen.
 *
 * Required env vars (validated via lib/integrations/providers/gmailConfig.ts):
 *   GMAIL_CLIENT_ID              — from Google Cloud Console OAuth 2.0 credentials
 *   GMAIL_CLIENT_SECRET          — from Google Cloud Console (never logged)
 *   GMAIL_OAUTH_REDIRECT_URI     — must match exactly what is registered in Cloud Console
 *
 * Scope: https://www.googleapis.com/auth/gmail.readonly
 *   Read-only access to messages, labels, and threads.
 *
 * access_type=offline + prompt=consent ensures a refresh_token is returned
 * on the first authorization (and on explicit re-consent).
 *
 * On success: redirects to Google's consent screen.
 * On missing config: returns 500 JSON { error, code, missing }.
 */

import { NextRequest, NextResponse }  from "next/server";
import crypto                          from "crypto";
import { getSession }                  from "@/lib/auth";
import {
  getGmailOAuthConfig,
  GmailOAuthNotConfiguredError,
  warnIfGmailMisconfigured,
}                                      from "@/lib/integrations/providers/gmailConfig";

/** Cookie used to store the CSRF state across the OAuth round-trip. */
export const GMAIL_STATE_COOKIE = "_gmail_oauth_state";

// ─── Startup diagnostic ───────────────────────────────────────────────────────
warnIfGmailMisconfigured();

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_SCOPE     = "https://www.googleapis.com/auth/gmail.readonly";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let config: ReturnType<typeof getGmailOAuthConfig>;
  try {
    config = getGmailOAuthConfig();
  } catch (err) {
    if (err instanceof GmailOAuthNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, code: err.code, missing: err.missingKeys },
        { status: 500 },
      );
    }
    throw err;
  }

  // 64-hex-character CSRF state
  const state = crypto.randomBytes(32).toString("hex");

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id",              config.clientId);
  authUrl.searchParams.set("redirect_uri",           config.redirectUri);
  authUrl.searchParams.set("response_type",          "code");
  authUrl.searchParams.set("scope",                  GMAIL_SCOPE);
  authUrl.searchParams.set("access_type",            "offline");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("prompt",                 "consent");
  authUrl.searchParams.set("state",                  state);

  const response = NextResponse.redirect(authUrl.toString());

  response.cookies.set(GMAIL_STATE_COOKIE, state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",  // must survive the cross-site redirect back from Google
    maxAge:   600,    // 10 minutes
    path:     "/",
  });

  return response;
}
