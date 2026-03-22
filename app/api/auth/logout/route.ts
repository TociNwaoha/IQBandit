/**
 * app/api/auth/logout/route.ts
 * Clears the session cookie.
 */

export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { clearAuthCookie } from "@/lib/auth-helpers";

export async function POST() {
  const response = NextResponse.json({ success: true }, { status: 200 });
  clearAuthCookie(response);
  return response;
}

// Support GET for link-based logout (e.g. <a href="/api/auth/logout">)
export async function GET() {
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const response = NextResponse.redirect(new URL("/login", appUrl));
  clearAuthCookie(response);
  return response;
}
