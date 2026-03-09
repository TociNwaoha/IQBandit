/**
 * app/api/integrations/connections/route.ts
 *
 * GET  — returns all connections for the current user (masked, no secrets).
 * POST — creates or updates a connection (encrypts tokens before storage).
 *
 * POST body (JSON):
 * {
 *   provider_id:    string  (required)
 *   auth_type?:     string  (must be in provider.authTypes; defaults to preferredAuthType)
 *   access_token?:  string  (plaintext; encrypted before storage)
 *   refresh_token?: string  (plaintext; encrypted before storage)
 *   account_label?: string  (display name for this connection)
 *   scopes?:        string[]
 *   expires_at?:    string  (ISO-8601)
 *   metadata?:      object
 *   status?:        "connected" | "expired" | "error" | "disconnected"
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  listConnections,
  upsertConnection,
  type UpsertConnectionInput,
} from "@/lib/integrations/connections";

const USER_ID = "default"; // single-admin MVP; replace with session.userId for multi-user

/** Headers applied to every response — connections are user-specific; never cache. */
const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connections = listConnections(USER_ID);
  return NextResponse.json({ connections }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;

  // Reject unknown fields — callers should not send anything outside this set.
  const ALLOWED_KEYS = new Set([
    "provider_id", "auth_type", "access_token", "refresh_token",
    "account_label", "scopes", "expires_at", "metadata", "status",
  ]);
  const unknownKeys = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      { error: `Unknown field(s): ${unknownKeys.map((k) => `"${k}"`).join(", ")}` },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!raw.provider_id || typeof raw.provider_id !== "string") {
    return NextResponse.json({ error: "provider_id is required" }, { status: 400, headers: NO_STORE });
  }

  const input: UpsertConnectionInput = {
    provider_id:  raw.provider_id,
    auth_type:    typeof raw.auth_type === "string" ? raw.auth_type : undefined,
    access_token: typeof raw.access_token === "string" ? raw.access_token : undefined,
    refresh_token: typeof raw.refresh_token === "string" ? raw.refresh_token : undefined,
    account_label: typeof raw.account_label === "string" ? raw.account_label : undefined,
    // Filter out any non-string entries that a loose JSON sender might include
    scopes: Array.isArray(raw.scopes)
      ? (raw.scopes as unknown[]).filter((s): s is string => typeof s === "string")
      : undefined,
    expires_at:   typeof raw.expires_at === "string" ? raw.expires_at : undefined,
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : undefined,
    status: typeof raw.status === "string" ? (raw.status as never) : undefined,
  };

  try {
    const connection = upsertConnection(input, USER_ID);
    return NextResponse.json({ connection }, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save connection";
    // Surface all data-validation errors as 400; infrastructure errors as 500.
    const isValidation =
      message.includes("Unknown provider") ||
      message.includes("auth_type") ||
      message.includes("Invalid status") ||
      message.includes("webhook_inbound") ||
      message.includes("does not accept");
    return NextResponse.json(
      { error: message },
      { status: isValidation ? 400 : 500, headers: NO_STORE }
    );
  }
}
