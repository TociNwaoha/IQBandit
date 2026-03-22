/**
 * lib/posts.ts
 * Post management for the IQBandit social media posting workflow.
 * Handles draft creation, approval, rejection, and publishing.
 *
 * Tables used: posts (created in lib/connections.ts DB init)
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

import fs from "fs";
import path from "path";

// ─── types ────────────────────────────────────────────────────────────────────

export type PostStatus = "draft" | "approved" | "posted" | "failed" | "rejected";

export interface Post {
  id: number;
  user_id: string;
  platform: string;
  status: PostStatus;
  content: string;
  thread_posts: string[] | null;
  scheduled_for: string | null;
  posted_at: string | null;
  post_url: string | null;
  tweet_ids: string[] | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface RawPost {
  id: number;
  user_id: string;
  platform: string;
  status: string;
  content: string;
  thread_posts: string | null;
  scheduled_for: string | null;
  posted_at: string | null;
  post_url: string | null;
  tweet_ids: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
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

    db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       TEXT NOT NULL,
        platform      TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'draft',
        content       TEXT NOT NULL,
        thread_posts  TEXT,
        scheduled_for TEXT,
        posted_at     TEXT,
        post_url      TEXT,
        tweet_ids     TEXT,
        error_message TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_posts_user_status
        ON posts (user_id, status)
    `);

    return db;
  } catch (err) {
    console.warn(
      "[posts] DB unavailable — post storage disabled.",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

const postsDb: BetterSQLiteDB | null = tryOpenDB();

// ─── internal helpers ─────────────────────────────────────────────────────────

function parsePost(raw: RawPost): Post {
  return {
    id:            raw.id,
    user_id:       raw.user_id,
    platform:      raw.platform,
    status:        raw.status as PostStatus,
    content:       raw.content,
    thread_posts:  raw.thread_posts ? (JSON.parse(raw.thread_posts) as string[]) : null,
    scheduled_for: raw.scheduled_for,
    posted_at:     raw.posted_at,
    post_url:      raw.post_url,
    tweet_ids:     raw.tweet_ids ? (JSON.parse(raw.tweet_ids) as string[]) : null,
    error_message: raw.error_message,
    created_at:    raw.created_at,
    updated_at:    raw.updated_at,
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Creates a draft post.
 * Returns the new post's numeric ID.
 * Throws if DB unavailable.
 */
export function createDraft(
  userId: string,
  platform: string,
  content: string,
  threadPosts?: string[],
  scheduledFor?: string
): number {
  if (!postsDb) throw new Error("[posts] DB unavailable");

  const now = new Date().toISOString();
  const result = postsDb
    .prepare(`
      INSERT INTO posts
        (user_id, platform, status, content, thread_posts, scheduled_for, created_at, updated_at)
      VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)
    `)
    .run(
      userId,
      platform,
      content,
      threadPosts && threadPosts.length > 0 ? JSON.stringify(threadPosts) : null,
      scheduledFor ?? null,
      now,
      now
    );

  const id = result.lastInsertRowid as number;
  console.log(`[posts] Draft created: id=${id} platform=${platform} user=${userId}`);
  return id;
}

/**
 * Returns all draft posts for a user, optionally filtered by platform.
 */
export function getDrafts(userId: string, platform?: string): Post[] {
  if (!postsDb) return [];
  try {
    const rows = platform
      ? (postsDb
          .prepare(`SELECT * FROM posts WHERE user_id = ? AND platform = ? AND status = 'draft' ORDER BY created_at DESC`)
          .all(userId, platform) as RawPost[])
      : (postsDb
          .prepare(`SELECT * FROM posts WHERE user_id = ? AND status = 'draft' ORDER BY created_at DESC`)
          .all(userId) as RawPost[]);
    return rows.map(parsePost);
  } catch {
    return [];
  }
}

/**
 * Returns posts filtered by optional status, newest first.
 */
export function getPosts(userId: string, status?: PostStatus, limit = 50): Post[] {
  if (!postsDb) return [];
  try {
    const rows = status
      ? (postsDb
          .prepare(`SELECT * FROM posts WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?`)
          .all(userId, status, limit) as RawPost[])
      : (postsDb
          .prepare(`SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
          .all(userId, limit) as RawPost[]);
    return rows.map(parsePost);
  } catch {
    return [];
  }
}

/**
 * Returns a single post by ID.
 * Returns null if not found.
 */
export function getPost(postId: number, userId: string): Post | null {
  if (!postsDb) return null;
  try {
    const row = postsDb
      .prepare(`SELECT * FROM posts WHERE id = ? AND user_id = ?`)
      .get(postId, userId) as RawPost | undefined;
    return row ? parsePost(row) : null;
  } catch {
    return null;
  }
}

/**
 * Returns all past-due scheduled posts (status='draft' + scheduled_for in the past).
 * Used by the cron job to find posts that need to be published.
 */
export function getScheduledPosts(): Post[] {
  if (!postsDb) return [];
  try {
    const now = new Date().toISOString();
    const rows = postsDb
      .prepare(`
        SELECT * FROM posts
        WHERE status = 'draft' AND scheduled_for IS NOT NULL AND scheduled_for <= ?
        ORDER BY scheduled_for ASC
      `)
      .all(now) as RawPost[];
    return rows.map(parsePost);
  } catch {
    return [];
  }
}

/**
 * Marks a post as rejected.
 * Throws if post not found or DB unavailable.
 */
export function rejectPost(postId: number, userId: string): Post {
  if (!postsDb) throw new Error("[posts] DB unavailable");

  const now = new Date().toISOString();
  postsDb
    .prepare(`UPDATE posts SET status = 'rejected', updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(now, postId, userId);

  const updated = getPost(postId, userId);
  if (!updated) throw new Error(`[posts] Post ${postId} not found after reject`);
  console.log(`[posts] Post ${postId} rejected`);
  return updated;
}

/**
 * Publishes a post immediately by calling the appropriate platform API.
 * Updates status to 'posted' on success or 'failed' on error.
 * Returns the updated post.
 */
export async function postNow(postId: number, userId: string): Promise<Post> {
  if (!postsDb) throw new Error("[posts] DB unavailable");

  const post = getPost(postId, userId);
  if (!post) throw new Error(`[posts] Post ${postId} not found`);

  const { getConnection } = await import("@/lib/connections");
  const credentials = getConnection(userId, post.platform);
  if (!credentials) {
    const now = new Date().toISOString();
    postsDb
      .prepare(`UPDATE posts SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`)
      .run(`No ${post.platform} credentials found`, now, postId);
    throw new Error(`[posts] No ${post.platform} credentials for user ${userId}`);
  }

  try {
    let postUrl: string | null = null;
    let tweetIds: string[] | null = null;

    if (post.platform === "twitter") {
      const { postTweet, postThread } = await import("@/lib/twitter");

      if (post.thread_posts && post.thread_posts.length > 0) {
        const allTweets = [post.content, ...post.thread_posts];
        const result = await postThread(credentials, allTweets);
        tweetIds = result.ids;
        postUrl = result.urls[0];
      } else {
        const result = await postTweet(credentials, post.content);
        tweetIds = [result.id];
        postUrl = result.url;
      }
    } else {
      throw new Error(`[posts] Unsupported platform: ${post.platform}`);
    }

    const now = new Date().toISOString();
    postsDb
      .prepare(`
        UPDATE posts
        SET status = 'posted', posted_at = ?, post_url = ?, tweet_ids = ?, error_message = NULL, updated_at = ?
        WHERE id = ?
      `)
      .run(now, postUrl, tweetIds ? JSON.stringify(tweetIds) : null, now, postId);

    console.log(`[posts] Post ${postId} published: ${postUrl}`);
    return getPost(postId, userId)!;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const now = new Date().toISOString();
    postsDb
      .prepare(`UPDATE posts SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?`)
      .run(errMsg, now, postId);
    console.error(`[posts] Post ${postId} failed:`, errMsg);
    throw err;
  }
}

/**
 * Approves a post and publishes it immediately (unless scheduled_for is set).
 * Returns the updated post.
 */
export async function approvePost(postId: number, userId: string): Promise<Post> {
  if (!postsDb) throw new Error("[posts] DB unavailable");

  const post = getPost(postId, userId);
  if (!post) throw new Error(`[posts] Post ${postId} not found`);

  // Mark approved
  const now = new Date().toISOString();
  postsDb
    .prepare(`UPDATE posts SET status = 'approved', updated_at = ? WHERE id = ?`)
    .run(now, postId);

  // If scheduled, leave it for the cron job
  if (post.scheduled_for && new Date(post.scheduled_for) > new Date()) {
    console.log(`[posts] Post ${postId} approved for scheduled posting at ${post.scheduled_for}`);
    return getPost(postId, userId)!;
  }

  // Post immediately
  return postNow(postId, userId);
}
