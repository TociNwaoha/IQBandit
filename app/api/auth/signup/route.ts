/**
 * app/api/auth/signup/route.ts
 * Creates a new user account with email + password.
 * POST — public route, no auth required.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  generateUserId,
  hashPassword,
  createJWT,
  setAuthCookie,
} from "@/lib/auth-helpers";
import { createUser, userExists } from "@/lib/user-db";
import { saveSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string; name?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { email, password, name } = body;

  // Validate inputs
  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "Name, email, and password are required" },
      { status: 400 }
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  if (name.trim().length < 2) {
    return NextResponse.json(
      { error: "Name must be at least 2 characters" },
      { status: 400 }
    );
  }

  // Check for existing account
  if (userExists(email.toLowerCase().trim())) {
    return NextResponse.json(
      { error: "Account already exists" },
      { status: 409 }
    );
  }

  // Create user
  const passwordHash = await hashPassword(password);
  const userId       = generateUserId(email);
  const cleanName    = name.trim();
  const cleanEmail   = email.toLowerCase().trim();

  const user = createUser({
    id:           userId,
    email:        cleanEmail,
    name:         cleanName,
    passwordHash,
  });

  // Sign JWT + set cookie
  const token    = await createJWT({ userId: user.id, email: user.email, name: cleanName });
  const response = NextResponse.json(
    { success: true, userId: user.id, email: user.email, name: cleanName },
    { status: 201 }
  );
  setAuthCookie(response, token);

  // Mark setup complete for new SaaS users — they don't need the global gateway wizard
  saveSettings({ SETUP_WIZARD_DONE: "true" });
  response.cookies.set("iqbandit_setup", "done", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
  });

  console.log(`[auth] signup email=${cleanEmail} userId=${userId}`);
  return response;
}
