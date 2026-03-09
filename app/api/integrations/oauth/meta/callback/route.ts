/**
 * app/api/integrations/oauth/meta/callback/route.ts
 * GET — handles the Meta (Facebook) OAuth 2.0 authorization callback.
 *
 * Flow:
 *   1. Verify session (unauthenticated → /login)
 *   2. Check for user-denial error from Facebook
 *   3. Validate CSRF state against the cookie set by the start route
 *   4. Exchange the authorization code for a short-lived access token
 *   5. Upgrade to a long-lived token (60 days vs ~1–2 hours) — non-fatal if it fails
 *   6. Fetch /me to get user name for account_label
 *   7. Store the connection via upsertConnection() (token encrypted at rest)
 *   8. Redirect to /integrations?connected=meta_ads (success)
 *      or /integrations?error=<code> (any failure)
 *
 * Required env vars:
 *   META_APP_ID              — from Meta for Developers App Dashboard
 *   META_APP_SECRET          — from Meta for Developers App Dashboard
 *   META_OAUTH_REDIRECT_URI  — must match exactly what is registered in the app
 *
 * Token lifecycle:
 *   Meta short-lived user access tokens expire in ~1–2 hours.
 *   Long-lived tokens expire in 60 days. This callback upgrades automatically.
 *   There is no refresh token — the user must reconnect when the token expires.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { upsertConnection } from "@/lib/integrations/connections";
import { META_STATE_COOKIE } from "../start/route";

// ─── constants ────────────────────────────────────────────────────────────────

const GRAPH_API = "https://graph.facebook.com/v21.0";
const NO_STORE  = { "Cache-Control": "no-store, private" } as const;

// ─── types ────────────────────────────────────────────────────────────────────

interface MetaTokenResponse {
  access_token: string;
  token_type:   string;
  /** Seconds until expiry. Present for short-lived and long-lived tokens. */
  expires_in?:  number;
}

interface MetaMeResponse {
  id:   string;
  name: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a redirect response to /integrations and clears the OAuth state cookie.
 * Always call this instead of NextResponse.redirect() directly.
 */
function redirectToIntegrations(
  baseUrl: string,
  params: Record<string, string>
): NextResponse {
  const dest = new URL("/integrations", baseUrl);
  for (const [key, value] of Object.entries(params)) {
    dest.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(dest.toString(), { headers: NO_STORE });
  // Delete the CSRF cookie regardless of outcome — it's single-use.
  response.cookies.set(META_STATE_COOKIE, "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   0,
    path:     "/",
  });
  return response;
}

/**
 * Exchanges an authorization code for a short-lived Meta access token.
 * Throws with a human-readable message on failure.
 */
async function exchangeCode(
  code: string,
  appId: string,
  appSecret: string,
  redirectUri: string
): Promise<MetaTokenResponse> {
  const url = new URL(`${GRAPH_API}/oauth/access_token`);
  url.searchParams.set("client_id",     appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri",  redirectUri);
  url.searchParams.set("code",          code);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    throw new Error(isTimeout ? "Token exchange timed out" : "Network error during token exchange");
  }

  const data = await res.json().catch(() => ({})) as {
    access_token?: string;
    token_type?:   string;
    expires_in?:   number;
    error?: { message?: string; code?: number };
  };

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  }

  return {
    access_token: data.access_token ?? "",
    token_type:   data.token_type   ?? "bearer",
    expires_in:   data.expires_in,
  };
}

/**
 * Exchanges a short-lived token for a long-lived token (~60 days).
 * Returns the new token on success; throws on failure.
 */
async function exchangeForLongLivedToken(
  shortToken: string,
  appId: string,
  appSecret: string
): Promise<MetaTokenResponse> {
  const url = new URL(`${GRAPH_API}/oauth/access_token`);
  url.searchParams.set("grant_type",          "fb_exchange_token");
  url.searchParams.set("client_id",           appId);
  url.searchParams.set("client_secret",       appSecret);
  url.searchParams.set("fb_exchange_token",   shortToken);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    throw new Error(isTimeout ? "Long-lived token exchange timed out" : "Network error");
  }

  const data = await res.json().catch(() => ({})) as {
    access_token?: string;
    token_type?:   string;
    expires_in?:   number;
    error?: { message?: string };
  };

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `HTTP ${res.status}`);
  }

  return {
    access_token: data.access_token ?? shortToken,
    token_type:   data.token_type   ?? "bearer",
    expires_in:   data.expires_in,
  };
}

/**
 * Calls /me to get the token owner's name and ID for the account_label.
 * Returns null silently on any failure — this step is non-critical.
 */
async function fetchMe(accessToken: string): Promise<MetaMeResponse | null> {
  try {
    const url = new URL(`${GRAPH_API}/me`);
    url.searchParams.set("fields",       "id,name");
    url.searchParams.set("access_token", accessToken);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return await res.json() as MetaMeResponse;
  } catch {
    return null;
  }
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Unauthenticated users shouldn't be completing OAuth flows.
  const session = await getSession(request);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url).toString());
  }

  const { searchParams } = request.nextUrl;
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  // Facebook sends "error" and "error_description" when the user denies access
  const error            = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const base = request.nextUrl.origin;

  // ── user denied the consent screen ──────────────────────────────────────────
  if (error) {
    const raw  = errorDescription ?? error;
    const safe = raw.slice(0, 80).replace(/[^a-zA-Z0-9 _\-:]/g, "");
    return redirectToIntegrations(base, { error: `meta_${safe}` });
  }

  // ── CSRF state validation ──────────────────────────────────────────────────
  const savedState = request.cookies.get(META_STATE_COOKIE)?.value;
  if (!state || !savedState || state !== savedState) {
    return redirectToIntegrations(base, { error: "meta_state_mismatch" });
  }

  // ── authorization code required ───────────────────────────────────────────
  if (!code) {
    return redirectToIntegrations(base, { error: "meta_missing_code" });
  }

  // ── validate required env vars ────────────────────────────────────────────
  const appId       = process.env.META_APP_ID       ?? "";
  const appSecret   = process.env.META_APP_SECRET   ?? "";
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI ?? "";

  if (!appId || !appSecret || !redirectUri) {
    return redirectToIntegrations(base, { error: "meta_env_vars_not_configured" });
  }

  // ── token exchange ────────────────────────────────────────────────────────
  let tokenData: MetaTokenResponse;
  try {
    tokenData = await exchangeCode(code, appId, appSecret, redirectUri);
  } catch (err) {
    const msg  = err instanceof Error ? err.message : "token_exchange_failed";
    const safe = msg.slice(0, 80).replace(/[^a-zA-Z0-9 _\-:]/g, "");
    return redirectToIntegrations(base, { error: `meta_${safe}` });
  }

  // ── upgrade to long-lived token (non-fatal) ──────────────────────────────
  let finalToken  = tokenData.access_token;
  let expiresAt   = "";
  try {
    const longLived = await exchangeForLongLivedToken(tokenData.access_token, appId, appSecret);
    finalToken = longLived.access_token;
    if (longLived.expires_in) {
      expiresAt = new Date(Date.now() + longLived.expires_in * 1000).toISOString();
    }
  } catch {
    // Non-fatal — continue with short-lived token; it will expire soon.
    if (tokenData.expires_in) {
      expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    }
  }

  // ── fetch user info (non-fatal) ───────────────────────────────────────────
  const me = await fetchMe(finalToken);

  // ── store connection ──────────────────────────────────────────────────────
  try {
    upsertConnection({
      provider_id:   "meta_ads",
      auth_type:     "oauth2",
      access_token:  finalToken,                     // encrypted by upsertConnection
      account_label: me?.name ?? "Meta Ads Account",
      metadata: {
        user_id:   me?.id   ?? null,
        user_name: me?.name ?? null,
      },
      status: "connected",
      ...(expiresAt ? { expires_at: expiresAt } : {}),
    });
  } catch (err) {
    const msg  = err instanceof Error ? err.message : "storage_failed";
    const safe = msg.slice(0, 80).replace(/[^a-zA-Z0-9 _\-:]/g, "");
    return redirectToIntegrations(base, { error: `meta_${safe}` });
  }

  // ── success ───────────────────────────────────────────────────────────────
  return redirectToIntegrations(base, { connected: "meta_ads" });
}
