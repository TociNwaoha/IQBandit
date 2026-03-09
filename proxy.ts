/**
 * proxy.ts  (Next.js 16 — replaces the old middleware.ts convention)
 * Edge proxy — runs before every matched request.
 * Protects /onboarding and /dashboard; redirects unauthenticated users to /login.
 * Redirects authenticated users to /setup until gateway setup is complete.
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
  "/analytics",
  "/setup",
  "/agents",
  "/tool-logs",
  "/mission-control",
];

// Main app paths that are gated behind setup completion.
// /settings is intentionally excluded so users can always reconfigure freely.
const SETUP_GATED_PATHS = [
  "/marketplace",
  "/officebuilding",
  "/playground",
  "/dashboard",
  "/onboarding",
  "/logs",
  "/analytics",
  "/agents",
  "/tool-logs",
  "/mission-control",
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
  const isSetupGated = SETUP_GATED_PATHS.some(
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

  // If authenticated but setup not yet done, redirect to the setup wizard.
  // The iqbandit_setup cookie is set by /api/setup/complete when the wizard finishes.
  if (session && isSetupGated) {
    const setupDone = request.cookies.get("iqbandit_setup")?.value === "done";
    if (!setupDone) {
      return NextResponse.redirect(new URL("/setup", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on all routes except Next internals and static files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
