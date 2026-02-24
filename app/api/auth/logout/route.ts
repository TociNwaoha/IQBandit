/**
 * app/api/auth/logout/route.ts
 * Clears the session cookie and redirects to /login.
 */

import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true }, { status: 200 });
  clearSession(response);
  return response;
}

// Support GET for simple link-based logout (e.g. <a href="/api/auth/logout">)
export async function GET() {
  const response = NextResponse.redirect(
    new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
  );
  clearSession(response);
  return response;
}
