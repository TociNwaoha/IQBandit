/**
 * lib/conversations.ts
 * SQLite-backed conversation + message persistence.
 * Uses the same requests.db as lib/logger.ts and lib/settings.ts.
 * Tables are created on first import (idempotent).
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

// ─── types ────────────────────────────────────────────────────────────────────

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_model: string;
  agent_id:   string; // "" when no agent is pinned to this conversation
  user_id:    string; // owning user; "default" for legacy rows
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

// ─── db setup ─────────────────────────────────────────────────────────────────

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
    db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id         TEXT PRIMARY KEY,
        title      TEXT NOT NULL DEFAULT 'New Chat',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_model TEXT NOT NULL DEFAULT '',
        agent_id   TEXT NOT NULL DEFAULT '',
        user_id    TEXT NOT NULL DEFAULT 'default'
      );
      CREATE TABLE IF NOT EXISTS messages (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role            TEXT NOT NULL,
        content         TEXT NOT NULL,
        created_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_conv_idx
        ON messages(conversation_id, created_at);
    `);
    // Idempotent migrations — no-op if column already exists
    try {
      db.exec(`ALTER TABLE conversations ADD COLUMN agent_id TEXT NOT NULL DEFAULT ''`);
    } catch { /* already present */ }
    try {
      db.exec(`ALTER TABLE conversations ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'`);
    } catch { /* already present */ }
    return db;
  } catch {
    return null;
  }
}

const db: BetterSQLiteDB | null = tryOpenDB();

// ─── public API ───────────────────────────────────────────────────────────────

/** Creates a new conversation and returns it. Returns null if the DB is unavailable. */
export function createConversation(model: string, agentId = "", userId = "default"): Conversation | null {
  if (!db) return null;
  const now = new Date().toISOString();
  const conv: Conversation = {
    id: randomUUID(),
    title: "New Chat",
    created_at: now,
    updated_at: now,
    last_model: model,
    agent_id:   agentId,
    user_id:    userId,
  };
  db.prepare(
    "INSERT INTO conversations (id, title, created_at, updated_at, last_model, agent_id, user_id) VALUES (?,?,?,?,?,?,?)"
  ).run(conv.id, conv.title, conv.created_at, conv.updated_at, conv.last_model, conv.agent_id, conv.user_id);
  return conv;
}

/** Returns conversations sorted by updated_at DESC. Returns [] if the DB is unavailable. */
export function listConversations(limit = 50): Conversation[] {
  if (!db) return [];
  try {
    return db
      .prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?")
      .all(limit) as Conversation[];
  } catch {
    return [];
  }
}

/**
 * Returns conversations for a specific user (plus legacy "default" rows), newest first.
 * Used by Mission Control pages for per-user isolation.
 */
export function listConversationsForUser(userId: string, limit = 50): Conversation[] {
  if (!db) return [];
  try {
    return db
      .prepare(
        "SELECT * FROM conversations WHERE user_id = ? OR user_id = 'default' ORDER BY updated_at DESC LIMIT ?"
      )
      .all(userId, limit) as Conversation[];
  } catch {
    return [];
  }
}

/** Returns messages for a conversation sorted by created_at ASC. */
export function getMessages(conversationId: string): ConversationMessage[] {
  if (!db) return [];
  try {
    return db
      .prepare(
        "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all(conversationId) as ConversationMessage[];
  } catch {
    return [];
  }
}

/** Inserts a message. Returns the new row, or null if the DB is unavailable. */
export function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string
): ConversationMessage | null {
  if (!db) return null;
  const msg: ConversationMessage = {
    id: randomUUID(),
    conversation_id: conversationId,
    role,
    content,
    created_at: new Date().toISOString(),
  };
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)"
  ).run(msg.id, msg.conversation_id, msg.role, msg.content, msg.created_at);
  return msg;
}

/**
 * Updates updated_at and optionally the title and/or last_model.
 * Always updates updated_at so the conversation floats to the top of the list.
 */
export function updateConversationMeta(
  conversationId: string,
  opts: { model?: string; title?: string }
): void {
  if (!db) return;
  const now = new Date().toISOString();
  try {
    if (opts.title !== undefined && opts.model !== undefined) {
      db.prepare(
        "UPDATE conversations SET title=?, last_model=?, updated_at=? WHERE id=?"
      ).run(opts.title, opts.model, now, conversationId);
    } else if (opts.title !== undefined) {
      db.prepare(
        "UPDATE conversations SET title=?, updated_at=? WHERE id=?"
      ).run(opts.title, now, conversationId);
    } else if (opts.model !== undefined) {
      db.prepare(
        "UPDATE conversations SET last_model=?, updated_at=? WHERE id=?"
      ).run(opts.model, now, conversationId);
    } else {
      db.prepare("UPDATE conversations SET updated_at=? WHERE id=?").run(
        now,
        conversationId
      );
    }
  } catch {
    // Non-fatal — log to stderr but don't throw
    console.error("[conversations] updateConversationMeta failed for", conversationId);
  }
}

/**
 * Deletes a conversation and all its messages. No-op if DB unavailable or id not found.
 */
export function deleteConversation(id: string): void {
  if (!db) return;
  try {
    db.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
    db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  } catch {
    console.error("[conversations] deleteConversation failed for", id);
  }
}

/**
 * Finds the most recent conversation for a given agent, or creates a new one.
 * Used by the agent chat page to open (or resume) a persistent thread per agent.
 */
export function getOrCreateAgentConversation(
  agentId: string,
  model = "openclaw:main",
): Conversation | null {
  if (!db) return null;
  try {
    const existing = db
      .prepare(
        "SELECT * FROM conversations WHERE agent_id = ? ORDER BY updated_at DESC LIMIT 1",
      )
      .get(agentId) as Conversation | undefined;
    if (existing) return existing;
    return createConversation(model, agentId);
  } catch {
    return null;
  }
}

/** Returns a single conversation by ID, or null if not found. */
export function getConversation(id: string): Conversation | null {
  if (!db) return null;
  try {
    return (
      db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Conversation | undefined
    ) ?? null;
  } catch {
    return null;
  }
}

/**
 * Lists conversations pinned to a given agent, newest first.
 * Used by the agent chat page to populate the history dropdown.
 */
export function listConversationsForAgent(agentId: string, limit = 10): Conversation[] {
  if (!db) return [];
  try {
    return db
      .prepare("SELECT * FROM conversations WHERE agent_id = ? ORDER BY updated_at DESC LIMIT ?")
      .all(agentId, limit) as Conversation[];
  } catch {
    return [];
  }
}

/**
 * For each agentId, returns the most-recent message timestamp and a short content preview.
 * Used by the department page to show "Active 2h ago" and a message snippet on agent cards.
 */
export function getAgentsLastActivity(
  agentIds: string[]
): Record<string, { lastActive: string; preview: string }> {
  if (!db || agentIds.length === 0) return {};
  try {
    const result: Record<string, { lastActive: string; preview: string }> = {};
    const stmt = db.prepare(`
      SELECT m.created_at, m.content
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.agent_id = ?
      ORDER BY m.created_at DESC
      LIMIT 1
    `);
    for (const agentId of agentIds) {
      const row = stmt.get(agentId) as { created_at: string; content: string } | undefined;
      if (row) {
        result[agentId] = {
          lastActive: row.created_at,
          preview: row.content.slice(0, 60),
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Idempotent message insert — uses the caller-supplied id.
 * If a row with the same id already exists the INSERT is silently skipped.
 * Use this instead of addMessage() when the client supplies a stable message ID
 * (e.g. to prevent duplicate rows if the same request is retried).
 */
export function upsertMessage(
  id: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string
): ConversationMessage | null {
  if (!db) return null;
  const msg: ConversationMessage = {
    id,
    conversation_id: conversationId,
    role,
    content,
    created_at: new Date().toISOString(),
  };
  try {
    db.prepare(
      "INSERT OR IGNORE INTO messages (id, conversation_id, role, content, created_at) VALUES (?,?,?,?,?)"
    ).run(msg.id, msg.conversation_id, msg.role, msg.content, msg.created_at);
    return msg;
  } catch {
    return null;
  }
}

/**
 * Sets the title of a conversation explicitly.
 * Used by the PATCH /api/conversations/title route and by the auto-title helper.
 * Never throws — logs to stderr on failure.
 */
export function setConversationTitle(id: string, title: string): void {
  if (!db) return;
  const trimmed = title.trim().slice(0, 120);
  try {
    db.prepare("UPDATE conversations SET title=?, updated_at=? WHERE id=?")
      .run(trimmed, new Date().toISOString(), id);
  } catch (err) {
    console.error("[conversations] setConversationTitle failed for", id, err);
  }
}

/**
 * Auto-titles a conversation from the first user message if the title is still
 * the default "New Chat". Truncates to 42 chars and appends "…" when needed.
 * No-op if the conversation already has a custom title.
 */
export function autoTitleFromFirstMessage(id: string, firstUserContent: string): void {
  if (!db) return;
  try {
    const row = db.prepare("SELECT title FROM conversations WHERE id=?").get(id) as
      { title: string } | undefined;
    if (!row || row.title !== "New Chat") return; // already titled
    const cleaned = firstUserContent.replace(/[\r\n]+/g, " ").trim();
    const title   = cleaned.length > 42 ? cleaned.slice(0, 42) + "…" : cleaned;
    if (title) setConversationTitle(id, title);
  } catch (err) {
    console.error("[conversations] autoTitleFromFirstMessage failed for", id, err);
  }
}

/**
 * Deletes all messages for a conversation without deleting the conversation itself.
 * Resets title to "New Chat" and updated_at so the thread appears fresh.
 */
export function clearConversationMessages(id: string): void {
  if (!db) return;
  try {
    db.transaction(() => {
      db!.prepare("DELETE FROM messages WHERE conversation_id = ?").run(id);
      db!.prepare("UPDATE conversations SET title='New Chat', updated_at=? WHERE id=?")
        .run(new Date().toISOString(), id);
    })();
  } catch (err) {
    console.error("[conversations] clearConversationMessages failed for", id, err);
  }
}

/**
 * Returns a markdown export of a conversation including all messages.
 * Returns null if the conversation is not found or the DB is unavailable.
 */
export function exportConversationMarkdown(
  id: string,
  agentName: string,
): string | null {
  if (!db) return null;
  try {
    const conv = getConversation(id);
    if (!conv) return null;
    const msgs = getMessages(id);

    const lines: string[] = [
      `# ${conv.title}`,
      ``,
      `**Agent:** ${agentName}`,
      `**Created:** ${conv.created_at}`,
      `**Exported:** ${new Date().toISOString()}`,
      ``,
      `---`,
      ``,
    ];

    for (const m of msgs) {
      const role = m.role === "user" ? "**You**" : `**${agentName}**`;
      lines.push(`### ${role}  `);
      lines.push(`*${m.created_at}*`);
      lines.push(``);
      lines.push(m.content);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }

    return lines.join("\n");
  } catch {
    return null;
  }
}

/**
 * Returns the agent_id pinned to a conversation, or null if not found / DB unavailable.
 * Used by /api/integrations/execute to resolve agent context from conversation_id.
 */
export function getConversationAgentId(id: string): string | null {
  if (!db) return null;
  try {
    const row = db
      .prepare("SELECT agent_id FROM conversations WHERE id = ?")
      .get(id) as { agent_id: string } | undefined;
    return row?.agent_id ?? null;
  } catch {
    return null;
  }
}
