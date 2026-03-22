/**
 * lib/notify.ts
 * Notification system for IQBandit.
 * When an agent creates a draft post, notifies the user through their
 * active OpenClaw container (which delivers via whatever channel they have open —
 * Telegram, WhatsApp, Discord, local chat, etc.).
 * Falls back to SQLite queue if the container is unreachable.
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 *
 * TODO: Add email fallback via Gmail OAuth in Phase 4
 */

import fs from "fs";
import path from "path";

// ─── types ────────────────────────────────────────────────────────────────────

export interface Notification {
  id: number;
  user_id: string;
  type: string;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

interface RawNotification {
  id: number;
  user_id: string;
  type: string;
  payload: string;
  read: number;
  created_at: string;
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const DB_PATH = path.join(LOGS_DIR, "requests.db");

type BetterSQLiteDB = import("better-sqlite3").Database;

function tryOpenDB(): BetterSQLiteDB | null {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db: BetterSQLiteDB = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    // notifications table is also created in lib/connections.ts — idempotent
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    TEXT NOT NULL,
        type       TEXT NOT NULL,
        payload    TEXT NOT NULL,
        read       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    return db;
  } catch (err) {
    console.warn(
      "[notify] DB unavailable — notification storage disabled.",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

const notifyDb: BetterSQLiteDB | null = tryOpenDB();

// ─── internal helpers ─────────────────────────────────────────────────────────

function storeNotification(
  userId: string,
  type: string,
  payload: Record<string, unknown>
): void {
  if (!notifyDb) return;
  try {
    notifyDb
      .prepare(`INSERT INTO notifications (user_id, type, payload) VALUES (?, ?, ?)`)
      .run(userId, type, JSON.stringify(payload));
  } catch (err) {
    console.error("[notify] Failed to store notification:", err);
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Notifies the user that a new draft is ready for approval.
 *
 * Strategy:
 * 1. Look up the user's active OpenClaw container port from the instances table.
 * 2. POST to the container's /api/message endpoint — OpenClaw delivers it
 *    through whatever channel the user has active (Telegram, WhatsApp, Discord, etc.).
 * 3. If the container is unreachable, fall back to SQLite notification queue
 *    for dashboard pickup.
 *
 * TODO: Add email fallback via Gmail OAuth in Phase 4
 */
export async function notifyDraftReady(
  userId: string,
  postId: number,
  content: string,
  platform: string
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const dashboardUrl = `${appUrl}/posts/${postId}`;
  const preview = content.length > 120 ? content.slice(0, 117) + "..." : content;

  const message =
    `📝 New ${platform} draft ready for your approval:\n\n` +
    `"${preview}"\n\n` +
    `Approve or reject: ${dashboardUrl}`;

  const payload = { postId, content, platform, dashboardUrl };

  // Look up user's container port from instances table
  let notified = false;
  try {
    const { getInstanceByUserId } = await import("@/lib/instances");
    const instance = getInstanceByUserId(userId);

    if (instance?.host_port && instance.status === "running") {
      const vpsHost = process.env.VPS_HOST ?? "127.0.0.1";
      const containerUrl = `http://${vpsHost}:${instance.host_port}/api/message`;

      const res = await fetch(containerUrl, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message }),
        signal:  AbortSignal.timeout(5_000), // 5s timeout
      });

      if (res.ok) {
        console.log(`[notify] Delivered draft notification to container for user ${userId}`);
        notified = true;
      } else {
        console.warn(`[notify] Container responded ${res.status} — falling back to DB queue`);
      }
    }
  } catch (err) {
    console.warn(`[notify] Container unreachable — falling back to DB queue:`, err);
  }

  if (!notified) {
    storeNotification(userId, "draft_ready", payload);
    console.log(`[notify] Stored draft notification in DB queue for user ${userId}`);
  }
}

/**
 * Returns unread notifications for a user, newest first.
 */
export function getUnreadNotifications(userId: string): Notification[] {
  if (!notifyDb) return [];
  try {
    const rows = notifyDb
      .prepare(`SELECT * FROM notifications WHERE user_id = ? AND read = 0 ORDER BY created_at DESC`)
      .all(userId) as RawNotification[];
    return rows.map((r) => ({
      id:         r.id,
      user_id:    r.user_id,
      type:       r.type,
      payload:    JSON.parse(r.payload) as Record<string, unknown>,
      read:       r.read === 1,
      created_at: r.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Marks a notification as read.
 */
export function markNotificationRead(notificationId: number, userId: string): void {
  if (!notifyDb) return;
  notifyDb
    .prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`)
    .run(notificationId, userId);
}
