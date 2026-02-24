/**
 * app/api/auth/login/route.ts
 * Single-admin login endpoint.
 * Validates credentials from env vars — no DB needed for MVP.
 */

import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { checkLoginRateLimit } from "@/lib/ratelimit";

export async function POST(request: NextRequest) {
  // Rate-limit by IP to resist brute-force attacks (10 attempts / 5 minutes).
  // We key on IP rather than email so attackers don't learn which emails are valid.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = checkLoginRateLimit(`login:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please wait before trying again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.ceil((rl.retryAfterMs ?? 300_000) / 1000)
          ),
        },
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

  // Compare against env-based admin credentials
  const adminEmail = process.env.STARTCLAW_ADMIN_EMAIL;
  const adminPassword = process.env.STARTCLAW_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error("Admin credentials env vars are not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  const isValid =
    email.toLowerCase().trim() === adminEmail.toLowerCase().trim() &&
    password === adminPassword;

  if (!isValid) {
    // Intentionally vague to avoid credential enumeration
    return NextResponse.json(
      { error: "Invalid credentials" },
      { status: 401 }
    );
  }

  // Create session and return success
  const response = NextResponse.json({ success: true }, { status: 200 });
  await createSession(response, { email: adminEmail, isAdmin: true });

  return response;
}
