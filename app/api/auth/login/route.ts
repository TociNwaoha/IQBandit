/**
 * app/api/auth/login/route.ts
 * Email + password login. Checks the users table.
 * Falls back to env-based admin credentials so the original admin
 * can still log in before signing up via /signup.
 * POST — public route.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { checkLoginRateLimit } from "@/lib/ratelimit";
import {
  generateUserId,
  hashPassword,
  verifyPassword,
  createJWT,
  setAuthCookie,
} from "@/lib/auth-helpers";
import { getUserByEmail, createUser } from "@/lib/user-db";

export async function POST(request: NextRequest) {
  // Rate-limit by IP (10 attempts / 5 minutes)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = checkLoginRateLimit(`login:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait before trying again." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 300_000) / 1000)) },
      }
    );
  }

  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const cleanEmail = email.toLowerCase().trim();

  // ── Look up user in DB ────────────────────────────────────────────────────
  let user = getUserByEmail(cleanEmail);

  // ── Env-based admin fallback ──────────────────────────────────────────────
  // If no user in DB, check original admin credentials from env.
  // This lets the original admin log in before their account is in the DB.
  if (!user) {
    const adminEmail = process.env.STARTCLAW_ADMIN_EMAIL?.toLowerCase().trim();
    const adminPass  = process.env.STARTCLAW_ADMIN_PASSWORD;

    if (adminEmail && adminPass && cleanEmail === adminEmail && password === adminPass) {
      // Auto-create admin account in DB on first login
      const userId = generateUserId(cleanEmail);
      const pwHash = await hashPassword(adminPass);
      try {
        user = createUser({
          id:           userId,
          email:        cleanEmail,
          name:         cleanEmail.split("@")[0] ?? "Admin",
          passwordHash: pwHash,
        });
        console.log(`[auth] auto-created admin user userId=${userId}`);
      } catch {
        // User may have been created between the check and the insert — retry
        user = getUserByEmail(cleanEmail);
      }
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Google-only account
  if (!user.password_hash) {
    return NextResponse.json(
      { error: "This account uses Google sign-in. Please use the Google button." },
      { status: 401 }
    );
  }

  // Verify password
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Create JWT + set cookie
  const name     = user.name ?? cleanEmail.split("@")[0] ?? "User";
  const token    = await createJWT({ userId: user.id, email: user.email, name });
  const response = NextResponse.json({
    success:        true,
    userId:         user.id,
    email:          user.email,
    name,
    onboardingDone: user.onboarding_done,
  });
  setAuthCookie(response, token);

  console.log(`[auth] login email=${cleanEmail}`);
  return response;
}
