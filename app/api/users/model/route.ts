/**
 * app/api/users/model/route.ts
 * Saves the user's LLM mode: either BanditLM (built-in) or BYOK (bring your own key).
 * BYOK API keys are AES-256 encrypted at rest via lib/crypto.ts.
 */

import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { encrypt } from "@/lib/crypto";
import { BYOK_PROVIDERS } from "@/lib/plans";

// ─── db ───────────────────────────────────────────────────────────────────────

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const DB_PATH  = path.join(LOGS_DIR, "requests.db");

type BetterSQLiteDB = import("better-sqlite3").Database;

function openDb(): BetterSQLiteDB {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

// ─── POST /api/users/model ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);

  let body: { mode?: string; provider?: string; api_key?: string; base_url?: string; model_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { mode, provider, api_key, base_url, model_id } = body;

  const db = openDb();

  if (mode === "banditlm") {
    db.prepare("UPDATE users SET model_mode = 'banditlm' WHERE id = ?").run(userId);
    return NextResponse.json({ ok: true });
  }

  if (mode === "byok") {
    if (!api_key || !model_id) {
      return NextResponse.json({ error: "api_key and model_id are required" }, { status: 400 });
    }
    const encrypted   = encrypt(api_key);
    const resolvedUrl = base_url?.trim() || BYOK_PROVIDERS.find((p) => p.id === provider)?.base_url || "";
    db.prepare(`
      UPDATE users
      SET model_mode    = 'byok',
          byok_provider = ?,
          byok_api_key  = ?,
          byok_base_url = ?,
          byok_model_id = ?
      WHERE id = ?
    `).run(provider ?? "custom", encrypted, resolvedUrl, model_id, userId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid mode — expected 'banditlm' or 'byok'" }, { status: 400 });
}
