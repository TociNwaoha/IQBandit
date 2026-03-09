/**
 * app/api/integrations/oauth/meta/start/route.ts
 * GET — initiates the Meta (Facebook) OAuth 2.0 authorization flow.
 *
 * Generates a cryptographically random CSRF state, stores it in a short-lived
 * httpOnly cookie, then redirects the browser to Facebook's consent screen.
 *
 * Required env vars (validated via lib/integrations/providers/metaAdsConfig.ts):
 *   META_APP_ID              — from Meta for Developers App Dashboard
 *   META_APP_SECRET          — from Meta for Developers App Dashboard
 *   META_OAUTH_REDIRECT_URI  — must match exactly what is registered in the app
 *
 * Requested scope: ads_read
 *   ads_read is sufficient for reading ad accounts, campaigns, and insights.
 *
 * On success: redirects to Facebook's consent screen (external).
 * On missing config: returns 500 JSON { error, code, missing }.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/auth";
import {
  getMetaOAuthConfig,
  MetaOAuthNotConfiguredError,
  warnIfMetaMisconfigured,
} from "@/lib/integrations/providers/metaAdsConfig";

/** Cookie name used to store the CSRF state across the OAuth round-trip. */
export const META_STATE_COOKIE = "_meta_oauth_state";

// ─── Startup diagnostic ───────────────────────────────────────────────────────
// Runs once when this module is first loaded. Mirrors the [SECURITY] pattern
// used in lib/auth.ts so missing Meta config is immediately visible in logs.
warnIfMetaMisconfigured();

const META_AUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth";

export async function GET(request: NextRequest) {
  // Only authenticated users can initiate an OAuth flow.
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Validate all required env vars in one call. Returns a typed error that
  // includes every missing key so the response body is fully actionable.
  let config: ReturnType<typeof getMetaOAuthConfig>;
  try {
    config = getMetaOAuthConfig();
  } catch (err) {
    if (err instanceof MetaOAuthNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, code: err.code, missing: err.missingKeys },
        { status: 500 },
      );
    }
    throw err;
  }

  // Generate a 64-hex-character random state for CSRF protection.
  const state = crypto.randomBytes(32).toString("hex");

  const authUrl = new URL(META_AUTH_URL);
  authUrl.searchParams.set("client_id",     config.appId);
  authUrl.searchParams.set("redirect_uri",  config.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope",         "ads_read");
  authUrl.searchParams.set("state",         state);

  const response = NextResponse.redirect(authUrl.toString());

  // Store state in a short-lived httpOnly cookie so the callback can validate it.
  response.cookies.set(META_STATE_COOKIE, state, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",   // "lax" required: cookie must survive the cross-site redirect from Facebook
    maxAge:   600,     // 10 minutes
    path:     "/",
  });

  return response;
}
