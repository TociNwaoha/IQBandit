/**
 * app/api/integrations/oauth/notion/start/route.ts
 * GET — initiates the Notion OAuth 2.0 authorization flow.
 *
 * Generates a cryptographically random CSRF state, stores it in a short-lived
 * httpOnly cookie, then redirects the browser to Notion's consent screen.
 *
 * Required env vars:
 *   NOTION_CLIENT_ID           — from Notion integration settings
 *   NOTION_OAUTH_REDIRECT_URI  — must match exactly what Notion has registered
 *
 * On success: redirects to Notion's consent screen (external).
 * On missing config: returns 503 JSON (never reaches Notion).
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/auth";

/** Cookie name used to store the CSRF state across the OAuth round-trip. */
export const NOTION_STATE_COOKIE = "_notion_oauth_state";

const NOTION_AUTH_URL = "https://api.notion.com/v1/oauth/authorize";

export async function GET(request: NextRequest) {
  // Only authenticated users can initiate an OAuth flow.
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "NOTION_CLIENT_ID is not configured. Add it to your environment variables." },
      { status: 503 }
    );
  }

  const redirectUri = process.env.NOTION_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    return NextResponse.json(
      { error: "NOTION_OAUTH_REDIRECT_URI is not configured. Add it to your environment variables." },
      { status: 503 }
    );
  }

  // Generate a 64-hex-character random state for CSRF protection.
  const state = crypto.randomBytes(32).toString("hex");

  const authUrl = new URL(NOTION_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());

  // Store state in a short-lived httpOnly cookie so the callback can validate it.
  response.cookies.set(NOTION_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",   // "lax" required: cookie must survive the cross-site redirect from Notion
    maxAge: 600,        // 10 minutes — more than enough for a consent screen interaction
    path: "/",
  });

  return response;
}
