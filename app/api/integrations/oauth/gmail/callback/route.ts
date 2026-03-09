/**
 * app/api/integrations/oauth/gmail/callback/route.ts
 * GET — handles the Google OAuth 2.0 authorization callback for Gmail.
 *
 * Flow:
 *   1. Verify session (unauthenticated → /login)
 *   2. Check for user-denial error from Google
 *   3. Validate CSRF state against the cookie set by the start route
 *   4. Exchange the authorization code for tokens (access + refresh)
 *   5. Fetch the user's Gmail address from the Gmail profile endpoint
 *   6. Store the connection via upsertConnection() (tokens encrypted at rest)
 *   7. Redirect to /integrations?connected=gmail (success)
 *      or /integrations?error=<code> (any failure)
 *
 * Required env vars:
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_OAUTH_REDIRECT_URI
 *
 * Token lifecycle:
 *   Google access tokens expire in ~1 hour. The refresh token is stored
 *   alongside the access token. gmailAuth.getValidGmailAccessToken() handles
 *   automatic refresh at call time, so the user never needs to reconnect
 *   unless the refresh token is revoked (e.g. password change, revoke in
 *   Google Account settings, or more than 50 simultaneous refresh tokens).
 */

import { NextRequest, NextResponse }  from "next/server";
import { getSession }                  from "@/lib/auth";
import { upsertConnection }            from "@/lib/integrations/connections";
import { GMAIL_STATE_COOKIE }          from "../start/route";
import {
  getGmailOAuthConfig,
  GmailOAuthNotConfiguredError,
}                                      from "@/lib/integrations/providers/gmailConfig";
import { syncTokensToMcpGmail }        from "@/lib/integrations/providers/gmailMcpSync";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_PROFILE    = "https://gmail.googleapis.com/gmail/v1/users/me/profile";
const NO_STORE         = { "Cache-Control": "no-store, private" } as const;

// ─── helpers ──────────────────────────────────────────────────────────────────

function redirectToIntegrations(baseUrl: string, params: Record<string, string>): NextResponse {
  const dest = new URL("/settings", baseUrl);
  for (const [key, value] of Object.entries(params)) {
    dest.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(dest.toString(), { headers: NO_STORE });
  // Delete the CSRF state cookie — it is single-use.
  response.cookies.set(GMAIL_STATE_COOKIE, "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   0,
    path:     "/",
  });
  return response;
}

interface GoogleTokenResponse {
  access_token?:  string;
  refresh_token?: string;
  expires_in?:    number;
  token_type?:    string;
  scope?:         string;
  error?:         string;
  error_description?: string;
}

async function exchangeCode(
  code:         string,
  clientId:     string,
  clientSecret: string,
  redirectUri:  string,
): Promise<Required<Pick<GoogleTokenResponse, "access_token">> & GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type:    "authorization_code",
    code,
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  redirectUri,
  });

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
      signal:  AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    throw new Error(isTimeout ? "Token exchange timed out" : "Network error during token exchange");
  }

  const data = await res.json().catch(() => ({})) as GoogleTokenResponse;

  if (!res.ok || data.error) {
    throw new Error(data.error_description ?? data.error ?? `HTTP ${res.status}`);
  }
  if (!data.access_token) {
    throw new Error("Google did not return an access_token");
  }

  return data as Required<Pick<GoogleTokenResponse, "access_token">> & GoogleTokenResponse;
}

/**
 * Fetches the authenticated user's Gmail address from the Gmail profile endpoint.
 * Returns null silently on any failure — this step is non-critical.
 */
async function fetchGmailAddress(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(GMAIL_PROFILE, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { emailAddress?: string };
    return data.emailAddress ?? null;
  } catch {
    return null;
  }
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url).toString());
  }

  const { searchParams } = request.nextUrl;
  const code             = searchParams.get("code");
  const state            = searchParams.get("state");
  const error            = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const base             = request.nextUrl.origin;

  // ── user denied the consent screen ──────────────────────────────────────────
  if (error) {
    const raw  = errorDescription ?? error;
    const safe = raw.slice(0, 80).replace(/[^a-zA-Z0-9 _\-:]/g, "");
    return redirectToIntegrations(base, { error: `gmail_${safe}` });
  }

  // ── CSRF state validation ──────────────────────────────────────────────────
  const savedState = request.cookies.get(GMAIL_STATE_COOKIE)?.value;
  if (!state || !savedState || state !== savedState) {
    return redirectToIntegrations(base, { error: "gmail_state_mismatch" });
  }

  // ── authorization code required ───────────────────────────────────────────
  if (!code) {
    return redirectToIntegrations(base, { error: "gmail_missing_code" });
  }

  // ── validate env vars ─────────────────────────────────────────────────────
  let config: ReturnType<typeof getGmailOAuthConfig>;
  try {
    config = getGmailOAuthConfig();
  } catch (err) {
    if (err instanceof GmailOAuthNotConfiguredError) {
      return redirectToIntegrations(base, { error: "gmail_env_vars_not_configured" });
    }
    throw err;
  }

  // ── token exchange ────────────────────────────────────────────────────────
  let tokenData: Awaited<ReturnType<typeof exchangeCode>>;
  try {
    tokenData = await exchangeCode(code, config.clientId, config.clientSecret, config.redirectUri);
  } catch (err) {
    const msg  = err instanceof Error ? err.message : "token_exchange_failed";
    const safe = msg.slice(0, 80).replace(/[^a-zA-Z0-9 _\-:]/g, "");
    return redirectToIntegrations(base, { error: `gmail_${safe}` });
  }

  const accessToken  = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;    // present when prompt=consent + access_type=offline
  const expiresAt    = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : "";

  // ── fetch user email (non-fatal) ──────────────────────────────────────────
  const emailAddress = await fetchGmailAddress(accessToken);

  // ── store connection ──────────────────────────────────────────────────────
  try {
    upsertConnection({
      provider_id:   "gmail",
      auth_type:     "oauth2",
      access_token:  accessToken,
      refresh_token: refreshToken ?? undefined,
      expires_at:    expiresAt,
      account_label: emailAddress ?? "",
      scopes:        ["gmail.readonly"],
      status:        "connected",
    });
  } catch (err) {
    const msg  = err instanceof Error ? err.message : "storage_failed";
    const safe = msg.slice(0, 80).replace(/[^a-zA-Z0-9 _\-:]/g, "");
    return redirectToIntegrations(base, { error: `gmail_${safe}` });
  }

  // ── sync to mcp-gmail tokens.json (non-fatal) ─────────────────────────────
  // Writes tokens in the format the mcp-gmail MCP server expects so that
  // OpenClaw's Gmail skill and IQ Bandit's chat Gmail route both work
  // from the same OAuth flow — no separate `npm run oauth` needed.
  await syncTokensToMcpGmail({
    accessToken,
    refreshToken,
    expiresIn:  tokenData.expires_in,
    scope:      tokenData.scope,
    email:      emailAddress,
  }).catch((err) => {
    console.error("[gmail-callback] mcp-gmail sync failed (non-fatal):", err);
  });

  return redirectToIntegrations(base, { connected: "gmail" });
}
