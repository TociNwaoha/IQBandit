/**
 * app/api/setup/complete/route.ts
 * Marks the setup wizard as done:
 *   1. Persists SETUP_WIZARD_DONE=true to SQLite.
 *   2. Sets the iqbandit_setup=done cookie so the edge middleware
 *      stops redirecting the user to /setup.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  saveSettings({ SETUP_WIZARD_DONE: "true" });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("iqbandit_setup", "done", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
  });
  return response;
}
