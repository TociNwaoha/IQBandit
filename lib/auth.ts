/**
 * lib/auth.ts
 * Server-side session helpers using signed httpOnly cookies via jose.
 * Never imported by client components — keep it server-only.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "iqbandit_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/** Returns the signing key derived from STARTCLAW_SESSION_SECRET */
function getSecretKey(): Uint8Array {
  const secret = process.env.STARTCLAW_SESSION_SECRET;
  if (!secret) throw new Error("STARTCLAW_SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  email: string;
  isAdmin: boolean;
}

/** Creates a signed JWT and sets it as an httpOnly cookie on a NextResponse */
export async function createSession(
  response: NextResponse,
  payload: SessionPayload
): Promise<NextResponse> {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}

/** Reads and verifies the session cookie. Returns null if missing or invalid. */
export async function getSession(
  request: NextRequest
): Promise<SessionPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    // Token expired or tampered
    return null;
  }
}

/** Reads session from the Next.js server-side cookies() API (for Server Components / Route Handlers) */
export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Clears the session cookie on a NextResponse */
export function clearSession(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

// ---------------------------------------------------------------------------
// Production credential sanity checks (runs once at module load)
// Non-throwing — the server still starts, but warnings appear in logs.
// ---------------------------------------------------------------------------

if (process.env.NODE_ENV === "production") {
  const secret = process.env.STARTCLAW_SESSION_SECRET ?? "";
  if (!secret || secret === "replace_with_32+_random_bytes" || secret.length < 32) {
    console.error(
      "[SECURITY] STARTCLAW_SESSION_SECRET is missing or looks like a placeholder. " +
        "Generate a real secret with: openssl rand -base64 32"
    );
  }
  const pw = process.env.STARTCLAW_ADMIN_PASSWORD ?? "";
  if (!pw || pw === "changeme_strong_password") {
    console.error(
      "[SECURITY] STARTCLAW_ADMIN_PASSWORD is missing or set to the default placeholder. " +
        "Set a strong password before exposing this server."
    );
  }
}
