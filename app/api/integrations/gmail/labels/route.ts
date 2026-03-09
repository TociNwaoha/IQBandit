/**
 * app/api/integrations/gmail/labels/route.ts
 * GET — list all Gmail labels for the connected account.
 *
 * Success: { result: GmailLabelsResult }
 * Errors: 401 auth · 409 not connected · 502 provider error
 */

import { NextRequest, NextResponse }   from "next/server";
import { getSession }                   from "@/lib/auth";
import { listLabels, GmailAdapterError } from "@/lib/integrations/providers/gmail";
import { getValidGmailAccessToken }     from "@/lib/integrations/providers/gmailAuth";
import { markConnectionStatus }         from "@/lib/integrations/connections";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  try {
    const token  = await getValidGmailAccessToken();
    const result = await listLabels(token);
    return NextResponse.json({ result }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof GmailAdapterError) {
      if (err.code === "GMAIL_UNAUTHORIZED") markConnectionStatus("gmail", "expired");
      if (err.code === "GMAIL_FORBIDDEN")    markConnectionStatus("gmail", "error");
      return NextResponse.json(
        { error: err.message, provider_error_code: err.code },
        { status: 502, headers: NO_STORE },
      );
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500, headers: NO_STORE });
  }
}
