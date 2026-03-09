/**
 * lib/integrations/providers/gmailAuth.ts
 *
 * Gmail access-token lifecycle management.
 *
 * getValidGmailAccessToken() is the single entry point used by the tool
 * dispatcher and the thin API wrappers.  It transparently refreshes expired
 * tokens and persists the new credentials so the next call succeeds without
 * a round-trip to Google.
 *
 * Flow:
 *   1. Load connection from DB — must be "connected".
 *   2. If expires_at is in the future (with a 60 s buffer) → return access token.
 *   3. If expired → use refresh_token to call Google token endpoint.
 *   4. On success → persist new access_token + expires_at (and new refresh_token
 *      if Google returned one).
 *   5. On invalid_grant → markConnectionStatus("expired") + throw
 *      GmailAdapterError("GMAIL_UNAUTHORIZED", …).
 *
 * SERVER-SIDE ONLY.
 */

import {
  getConnectionByProvider,
  getDecryptedAccessToken,
  getDecryptedRefreshToken,
  updateConnectionTokens,
  markConnectionStatus,
} from "@/lib/integrations/connections";
import { getGmailOAuthConfig }       from "./gmailConfig";
import { GmailAdapterError }         from "./gmail";
import { syncTokensToMcpGmail }      from "./gmailMcpSync";

// ─── constants ────────────────────────────────────────────────────────────────

const GOOGLE_TOKEN_URL   = "https://oauth2.googleapis.com/token";
const TOKEN_BUFFER_MS    = 60_000; // refresh 60 s before actual expiry
const REFRESH_TIMEOUT_MS = 15_000;

// ─── helpers ──────────────────────────────────────────────────────────────────

interface GoogleTokenResponse {
  access_token:  string;
  expires_in?:   number;
  refresh_token?: string;
  token_type?:   string;
}

/**
 * Calls the Google token endpoint to exchange a refresh token for a new
 * access token.  Throws GmailAdapterError on any failure.
 */
async function refreshGoogleToken(
  refreshToken: string,
  clientId:     string,
  clientSecret: string,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    refresh_token: refreshToken,
    client_id:     clientId,
    client_secret: clientSecret,
  });

  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
      signal:  AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    throw new GmailAdapterError(
      "GMAIL_NETWORK_ERROR",
      isTimeout
        ? "Gmail token refresh timed out. Try again."
        : "Network error during Gmail token refresh.",
    );
  }

  const data = await res.json().catch(() => ({})) as {
    access_token?:  string;
    expires_in?:    number;
    refresh_token?: string;
    token_type?:    string;
    error?:         string;
    error_description?: string;
  };

  if (!res.ok || data.error) {
    // invalid_grant = refresh token revoked / account disconnected
    if (data.error === "invalid_grant") {
      throw new GmailAdapterError(
        "GMAIL_UNAUTHORIZED",
        "Gmail refresh token has been revoked or expired. Please reconnect the integration at /integrations.",
      );
    }
    throw new GmailAdapterError(
      "GMAIL_UPSTREAM_ERROR",
      `Gmail token refresh failed: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`,
    );
  }

  if (!data.access_token) {
    throw new GmailAdapterError(
      "GMAIL_INVALID_RESPONSE",
      "Google token endpoint did not return an access_token.",
    );
  }

  return {
    access_token:  data.access_token,
    expires_in:    data.expires_in,
    refresh_token: data.refresh_token,
    token_type:    data.token_type,
  };
}

// ─── public entry point ───────────────────────────────────────────────────────

/**
 * Returns a guaranteed-valid Gmail access token for the given user.
 *
 * - If the stored token is still valid (expires_at > now + 60 s), it is
 *   returned immediately.
 * - If the stored token is expired, the refresh token is used to obtain a new
 *   access token from Google, which is then persisted before being returned.
 * - If the refresh fails with `invalid_grant`, the connection status is flipped
 *   to "expired" and GmailAdapterError("GMAIL_UNAUTHORIZED") is thrown.
 *
 * Throws GmailAdapterError on all error paths — callers should let it propagate
 * to the execute route which maps it to the appropriate HTTP response and
 * connection status flip.
 */
export async function getValidGmailAccessToken(userId = "default"): Promise<string> {
  // 1. Load connection — must be "connected"
  const conn = getConnectionByProvider("gmail", userId);
  if (!conn || conn.status !== "connected") {
    throw new GmailAdapterError(
      "GMAIL_UNAUTHORIZED",
      "Gmail is not connected. Go to /integrations to connect it.",
    );
  }

  // 2. Check whether the stored token is still within its valid window
  const isExpired =
    conn.expires_at
      ? new Date(conn.expires_at).getTime() < Date.now() + TOKEN_BUFFER_MS
      : false; // no expires_at = assume valid (e.g. non-expiring service account)

  if (!isExpired) {
    const token = getDecryptedAccessToken("gmail", userId);
    if (token) return token;
    // Token column empty despite "connected" status — fall through to refresh
  }

  // 3. Token is expired (or column was empty) — attempt refresh
  const refreshToken = getDecryptedRefreshToken("gmail", userId);
  if (!refreshToken) {
    // No refresh token stored — connection must be re-established
    markConnectionStatus("gmail", "expired", userId);
    throw new GmailAdapterError(
      "GMAIL_UNAUTHORIZED",
      "Gmail access token has expired and no refresh token is stored. " +
      "Please reconnect the integration at /integrations.",
    );
  }

  // 4. Exchange refresh token for a new access token
  let newTokens: GoogleTokenResponse;
  try {
    const { clientId, clientSecret } = getGmailOAuthConfig();
    newTokens = await refreshGoogleToken(refreshToken, clientId, clientSecret);
  } catch (err) {
    if (err instanceof GmailAdapterError && err.code === "GMAIL_UNAUTHORIZED") {
      // invalid_grant — refresh token is permanently revoked
      markConnectionStatus("gmail", "expired", userId);
    }
    throw err;
  }

  // 5. Persist the refreshed credentials
  const expiresAt = newTokens.expires_in
    ? new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
    : "";

  updateConnectionTokens(
    "gmail",
    {
      access_token:  newTokens.access_token,
      // Only pass refresh_token when Google issued a new one
      ...(newTokens.refresh_token ? { refresh_token: newTokens.refresh_token } : {}),
      expires_at: expiresAt,
    },
    userId,
  );

  // Keep mcp-gmail tokens.json in sync so the MCP server and OpenClaw skill
  // never see a stale token after IQ Bandit refreshes silently.
  syncTokensToMcpGmail({
    accessToken:  newTokens.access_token,
    refreshToken: newTokens.refresh_token,
    expiresIn:    newTokens.expires_in,
  }).catch(() => { /* non-fatal */ });

  return newTokens.access_token;
}
