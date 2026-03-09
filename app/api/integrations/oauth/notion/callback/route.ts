/**
 * app/api/integrations/oauth/notion/callback/route.ts
 * GET — handles the Notion OAuth 2.0 authorization callback.
 *
 * Flow:
 *   1. Verify session (unauthenticated → /login)
 *   2. Validate CSRF state against the cookie set by the start route
 *   3. Check for user-denial error from Notion
 *   4. Exchange the authorization code for an access token
 *   5. Store the connection via upsertConnection() (token encrypted at rest)
 *   6. Redirect to /integrations?connected=notion (success)
 *      or /integrations?error=<code> (any failure)
 *
 * Required env vars:
 *   NOTION_CLIENT_ID           — from Notion integration settings
 *   NOTION_CLIENT_SECRET       — from Notion integration settings
 *   NOTION_OAUTH_REDIRECT_URI  — must match the registered redirect URI exactly
 *
 * Notion does NOT issue refresh tokens. Access tokens do not expire.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { upsertConnection } from "@/lib/integrations/connections";
import { NOTION_STATE_COOKIE } from "../start/route";

// ─── Notion token exchange types ──────────────────────────────────────────────

interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name: string;
  workspace_icon: string | null;
  owner: {
    type: "workspace" | "user";
    workspace?: boolean;
    user?: { id: string; name: string };
  };
  duplicated_template_id: string | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

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
  response.cookies.set(NOTION_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

/**
 * Exchanges an authorization code for a Notion access token.
 * Throws with a human-readable message on any failure.
 */
async function exchangeCode(code: string): Promise<NotionTokenResponse> {
  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Notion OAuth environment variables are not fully configured");
  }

  // Notion requires Basic auth with client_id:client_secret, base64-encoded.
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  let res: Response;
  try {
    res = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    throw new Error(isTimeout ? "Token exchange timed out" : "Network error during token exchange");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as {
      error?: string;
      error_description?: string;
      message?: string;
    };
    throw new Error(data.error_description ?? data.message ?? data.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<NotionTokenResponse>;
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
  const error = searchParams.get("error");   // Notion sends "access_denied" when user cancels

  const base = request.nextUrl.origin;

  // ── user denied the consent screen ────────────────────────────────────────
  if (error) {
    return redirectToIntegrations(base, {
      error: `notion_${error}`,
    });
  }

  // ── CSRF state validation ─────────────────────────────────────────────────
  const savedState = request.cookies.get(NOTION_STATE_COOKIE)?.value;
  if (!state || !savedState || state !== savedState) {
    return redirectToIntegrations(base, {
      error: "notion_state_mismatch",
    });
  }

  // ── authorization code required ───────────────────────────────────────────
  if (!code) {
    return redirectToIntegrations(base, {
      error: "notion_missing_code",
    });
  }

  // ── token exchange ────────────────────────────────────────────────────────
  let tokenData: NotionTokenResponse;
  try {
    tokenData = await exchangeCode(code);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "token_exchange_failed";
    // Truncate to avoid leaking long error strings into the URL
    const safe = msg.slice(0, 80).replace(/[^a-zA-Z0-9 _\-:]/g, "");
    return redirectToIntegrations(base, { error: `notion_${safe}` });
  }

  // ── store connection ──────────────────────────────────────────────────────
  try {
    upsertConnection({
      provider_id:   "notion",
      auth_type:     "oauth2",
      access_token:  tokenData.access_token,   // encrypted by upsertConnection
      account_label: tokenData.workspace_name ?? "Notion Workspace",
      metadata: {
        workspace_id:   tokenData.workspace_id,
        workspace_name: tokenData.workspace_name,
        workspace_icon: tokenData.workspace_icon ?? null,
        bot_id:         tokenData.bot_id,
      },
      status: "connected",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "storage_failed";
    return redirectToIntegrations(base, { error: `notion_${msg.slice(0, 80)}` });
  }

  // ── success ───────────────────────────────────────────────────────────────
  return redirectToIntegrations(base, { connected: "notion" });
}
