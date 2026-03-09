/**
 * app/api/integrations/gmail/message/route.ts
 * POST — fetch a single Gmail message by ID.
 *
 * Body: { id: string (required), format?: "metadata" | "full" }
 * Success: { result: GmailMessage }
 * Errors: 400 validation · 401 auth · 409 not connected · 502 provider error
 *
 * Defaults to format="metadata" (headers only, no body) for compact results.
 */

import { NextRequest, NextResponse }   from "next/server";
import { getSession }                   from "@/lib/auth";
import { getMessage, GmailAdapterError, type GmailMessageFormat } from "@/lib/integrations/providers/gmail";
import { getValidGmailAccessToken }     from "@/lib/integrations/providers/gmailAuth";
import { markConnectionStatus }         from "@/lib/integrations/connections";

const NO_STORE        = { "Cache-Control": "no-store, private" } as const;
const VALID_FORMATS   = new Set<GmailMessageFormat>(["metadata", "full"]);

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const raw = (body ?? {}) as Record<string, unknown>;

  if (!raw.id || typeof raw.id !== "string" || !raw.id.trim()) {
    return NextResponse.json(
      { error: '"id" is required and must be a non-empty string' },
      { status: 400, headers: NO_STORE },
    );
  }

  const id = raw.id.trim();

  let format: GmailMessageFormat = "metadata";
  if (raw.format !== undefined) {
    if (typeof raw.format !== "string" || !VALID_FORMATS.has(raw.format as GmailMessageFormat)) {
      return NextResponse.json(
        { error: '"format" must be "metadata" or "full"' },
        { status: 400, headers: NO_STORE },
      );
    }
    format = raw.format as GmailMessageFormat;
  }

  try {
    const token  = await getValidGmailAccessToken();
    const result = await getMessage(token, { id, format });
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
