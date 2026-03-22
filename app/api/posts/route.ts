/**
 * app/api/posts/route.ts
 * Post management API — create drafts and list posts.
 *
 * GET  /api/posts — list user's posts
 *   Query params: ?status=draft&platform=twitter&limit=20
 *
 * POST /api/posts — create a draft post (called by the agent via HTTP)
 *   Body: { platform, content, thread_posts?, scheduled_for? }
 *   Returns: { postId, status: 'draft' }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { createDraft, getPosts } from "@/lib/posts";
import { notifyDraftReady } from "@/lib/notify";
import type { PostStatus } from "@/lib/posts";

// ─── GET — list posts ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);
  const { searchParams } = new URL(request.url);

  const status = searchParams.get("status") as PostStatus | null;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  const posts = getPosts(userId, status ?? undefined, limit);
  return NextResponse.json({ posts, total: posts.length });
}

// ─── POST — create draft ──────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);

  let body: {
    platform?: string;
    content?: string;
    thread_posts?: string[];
    scheduled_for?: string;
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { platform, content, thread_posts, scheduled_for } = body;

  if (!platform || !content) {
    return NextResponse.json(
      { error: "platform and content are required" },
      { status: 400 }
    );
  }

  if (typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "content must be a non-empty string" }, { status: 400 });
  }

  let postId: number;
  try {
    postId = createDraft(
      userId,
      platform,
      content.trim(),
      Array.isArray(thread_posts) ? thread_posts : undefined,
      scheduled_for
    );
  } catch (err) {
    console.error("[posts] Failed to create draft:", err);
    return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
  }

  // Notify user asynchronously — don't block the response
  notifyDraftReady(userId, postId, content.trim(), platform).catch((err) => {
    console.error("[posts] Notification failed:", err);
  });

  return NextResponse.json({ postId, status: "draft" }, { status: 201 });
}
