/**
 * proxy.ts  (Next.js 16 — replaces the old middleware.ts convention)
 * Edge proxy — runs before every matched request.
 * Protects /onboarding and /dashboard; redirects unauthenticated users to /login.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Routes that require authentication
const PROTECTED_PATHS = [
  "/marketplace",
  "/officebuilding",
  "/playground",  // kept for backward compat — redirects to /officebuilding
  "/settings",
  "/dashboard",   // kept so old links still redirect rather than 404
  "/onboarding",
  "/logs",
];

// If authenticated user hits /login, bounce them to /marketplace
const AUTH_PATHS = ["/login"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  const isAuthPage = AUTH_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  const session = await getSession(request);

  if (isProtected && !session) {
    // Not authenticated — redirect to login, preserve intended destination
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && session) {
    // Already authenticated — skip login page, go to marketplace
    return NextResponse.redirect(new URL("/marketplace", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all routes except Next internals and static files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
