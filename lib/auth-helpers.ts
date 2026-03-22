/**
 * lib/auth-helpers.ts
 * JWT, bcrypt, and cookie utilities for multi-user auth.
 * Uses STARTCLAW_SESSION_SECRET (same secret as lib/auth.ts) so both
 * old and new JWTs share the same cookie and signing key.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME    = "iqbandit_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSecretKey(): Uint8Array {
  const secret = process.env.STARTCLAW_SESSION_SECRET;
  if (!secret) throw new Error("STARTCLAW_SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

// ─── ID ───────────────────────────────────────────────────────────────────────

/**
 * Generates a deterministic user ID matching lib/users.ts pattern:
 * 'u_' + first 24 hex chars of sha256(lowercase(email))
 */
export function generateUserId(email: string): string {
  const normalized = email.toLowerCase().trim();
  const hash = createHash("sha256").update(normalized).digest("hex");
  return "u_" + hash.slice(0, 24);
}

// ─── password ─────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

export interface AuthPayload {
  userId: string;
  email:  string;
  name:   string;
}

export async function createJWT(payload: AuthPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());
}

export async function verifyJWT(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const { userId, email, name } = payload as Record<string, unknown>;
    if (typeof userId !== "string" || typeof email !== "string") return null;
    return { userId, email, name: typeof name === "string" ? name : "" };
  } catch {
    return null;
  }
}

// ─── cookies ──────────────────────────────────────────────────────────────────

export function setAuthCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   COOKIE_MAX_AGE,
    path:     "/",
  });
  return response;
}

export function clearAuthCookie(response: NextResponse): NextResponse {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   0,
    path:     "/",
  });
  return response;
}

// ─── request helper ───────────────────────────────────────────────────────────

export async function getUserFromRequest(request: NextRequest): Promise<AuthPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyJWT(token);
}
