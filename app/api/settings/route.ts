/**
 * app/api/settings/route.ts
 * GET  — returns current effective settings (token masked).
 * POST — persists a partial settings patch to SQLite.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSettings, saveSettings, GatewaySettings } from "@/lib/settings";

const ALLOWED_KEYS: (keyof GatewaySettings)[] = [
  "OPENCLAW_GATEWAY_URL",
  "OPENCLAW_GATEWAY_TOKEN",
  "OPENCLAW_CHAT_PATH",
  "STARTCLAW_CHAT_MODE",
  "DEFAULT_MODEL",
];

const TOKEN_MASK = "***configured***";

function masked(s: GatewaySettings) {
  return {
    ...s,
    OPENCLAW_GATEWAY_TOKEN: s.OPENCLAW_GATEWAY_TOKEN ? TOKEN_MASK : "",
  };
}

// ---------------------------------------------------------------------------
// Validation + normalization
// Returns { ok: true, clean } or { ok: false, errors }
// ---------------------------------------------------------------------------

type ValidationResult =
  | { ok: true; clean: Partial<GatewaySettings> }
  | { ok: false; errors: string[] };

function validateAndNormalize(patch: Partial<GatewaySettings>): ValidationResult {
  const errors: string[] = [];
  const clean: Partial<GatewaySettings> = {};

  for (const key of ALLOWED_KEYS) {
    if (!(key in patch) || patch[key] === undefined) continue;
    const raw = String(patch[key]).trim();

    if (key === "OPENCLAW_GATEWAY_TOKEN") {
      // Token is opaque — just trim it
      if (raw !== TOKEN_MASK) clean.OPENCLAW_GATEWAY_TOKEN = raw;
      continue;
    }

    if (key === "STARTCLAW_CHAT_MODE") {
      if (raw !== "openclaw" && raw !== "disabled") {
        errors.push(`STARTCLAW_CHAT_MODE must be "openclaw" or "disabled" (got "${raw}")`);
      } else {
        clean.STARTCLAW_CHAT_MODE = raw as "openclaw" | "disabled";
      }
      continue;
    }

    if (key === "OPENCLAW_GATEWAY_URL") {
      if (raw === "") {
        // Allow clearing the URL
        clean.OPENCLAW_GATEWAY_URL = "";
        continue;
      }
      try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          errors.push(`OPENCLAW_GATEWAY_URL must use http:// or https:// (got "${raw}")`);
        } else {
          // Strip trailing slash for uniformity
          clean.OPENCLAW_GATEWAY_URL = raw.replace(/\/+$/, "");
        }
      } catch {
        errors.push(`OPENCLAW_GATEWAY_URL is not a valid URL (got "${raw}")`);
      }
      continue;
    }

    if (key === "OPENCLAW_CHAT_PATH") {
      if (raw === "") {
        clean.OPENCLAW_CHAT_PATH = "";
        continue;
      }
      // Ensure path starts with /
      clean.OPENCLAW_CHAT_PATH = raw.startsWith("/") ? raw : `/${raw}`;
      continue;
    }

    if (key === "DEFAULT_MODEL") {
      if (raw === "") {
        errors.push("DEFAULT_MODEL must not be empty");
      } else {
        clean.DEFAULT_MODEL = raw;
      }
      continue;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, clean };
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(masked(getSettings()));
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<GatewaySettings>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = validateAndNormalize(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Validation failed", details: result.errors },
      { status: 400 }
    );
  }

  saveSettings(result.clean);
  return NextResponse.json(masked(getSettings()));
}
