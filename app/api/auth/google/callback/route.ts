/**
 * app/api/auth/google/callback/route.ts
 * Handles Google's OAuth redirect. Exchanges code for tokens,
 * fetches user profile, and creates/links/logs-in the user.
 * GET — public route.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  generateUserId,
  createJWT,
  setAuthCookie,
} from "@/lib/auth-helpers";
import {
  getUserByGoogleId,
  getUserByEmail,
  createUser,
  updateUser,
} from "@/lib/user-db";

interface GoogleTokenResponse {
  access_token:  string;
  id_token?:     string;
  error?:        string;
}

interface GoogleUserInfo {
  sub:     string;
  email:   string;
  name:    string;
  picture: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // User denied access
  if (error) {
    console.log(`[auth] google callback error=${error}`);
    return NextResponse.redirect(new URL("/login?error=google_denied", APP_URL));
  }

  // CSRF state check
  const savedState = request.cookies.get("oauth_state")?.value;
  if (!state || !savedState || state !== savedState) {
    console.error("[auth] google callback state mismatch");
    return NextResponse.redirect(new URL("/login?error=invalid_state", APP_URL));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=google_denied", APP_URL));
  }

  // Exchange code for tokens
  let tokenData: GoogleTokenResponse;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
        grant_type:    "authorization_code",
      }),
    });
    tokenData = await tokenRes.json() as GoogleTokenResponse;
  } catch (err) {
    console.error("[auth] google token exchange failed:", err);
    return NextResponse.redirect(new URL("/login?error=google_denied", APP_URL));
  }

  if (tokenData.error || !tokenData.access_token) {
    console.error("[auth] google token error:", tokenData.error);
    return NextResponse.redirect(new URL("/login?error=google_denied", APP_URL));
  }

  // Fetch user profile
  let profile: GoogleUserInfo;
  try {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    profile = await profileRes.json() as GoogleUserInfo;
  } catch (err) {
    console.error("[auth] google userinfo fetch failed:", err);
    return NextResponse.redirect(new URL("/login?error=google_denied", APP_URL));
  }

  const { sub: googleId, email, name, picture } = profile;

  // Determine user: existing Google user / link email user / new user
  let user = getUserByGoogleId(googleId);
  let isNewUser = false;

  if (!user) {
    const existingByEmail = getUserByEmail(email.toLowerCase().trim());
    if (existingByEmail) {
      // Link Google account to existing email/password account
      user = updateUser(existingByEmail.id, {
        googleId,
        avatarUrl: picture,
      });
    } else {
      // New user — create account
      isNewUser = true;
      const userId = generateUserId(email);
      user = createUser({
        id:        userId,
        email:     email.toLowerCase().trim(),
        name:      name ?? email.split("@")[0] ?? "User",
        googleId,
        avatarUrl: picture,
      });
    }
  }

  const displayName = user.name ?? name ?? email.split("@")[0] ?? "User";

  // Create JWT + set cookie
  const token    = await createJWT({ userId: user.id, email: user.email, name: displayName });
  const dest     = user.onboarding_done === 0 ? "/onboarding" : "/dashboard";
  const response = NextResponse.redirect(new URL(dest, APP_URL));

  setAuthCookie(response, token);

  // Clear the CSRF state cookie
  response.cookies.set("oauth_state", "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   0,
    path:     "/",
  });

  console.log(`[auth] google callback email=${email} isNewUser=${isNewUser}`);
  return response;
}
