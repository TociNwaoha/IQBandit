/**
 * app/api/debug/session/route.ts
 *
 * Development-only endpoint. Returns session status so you can confirm that
 * your cookie jar is populated and the session is valid from curl, without
 * hitting a page that redirects.
 *
 * Disabled by default — two independent gates must both be open:
 *   1. NODE_ENV !== "production"
 *   2. ENABLE_DEBUG_ENDPOINTS === "true"   (must be set explicitly in .env.local)
 *
 * If either gate is closed the route returns 404 (not 401) so it is
 * indistinguishable from a non-existent path in production.
 *
 * Response shapes:
 *   200  { authed: true,  email: string }   — valid session
 *   401  { authed: false }                  — missing or invalid cookie
 *   404  { error: "Not found" }             — production build OR env gate closed
 */

import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

const NO_STORE = "no-store, private";

export async function GET() {
  // Gate 1: never active in production builds.
  // Gate 2: must be explicitly opted in via .env.local.
  if (
    process.env.NODE_ENV === "production" ||
    process.env.ENABLE_DEBUG_ENDPOINTS !== "true"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json(
      { authed: false },
      { status: 401, headers: { "Cache-Control": NO_STORE } }
    );
  }

  return NextResponse.json(
    { authed: true, email: session.email },
    { headers: { "Cache-Control": NO_STORE } }
  );
}
