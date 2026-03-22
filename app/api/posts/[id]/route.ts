/**
 * app/api/posts/[id]/route.ts
 * Individual post operations.
 *
 * GET  /api/posts/[id]          — get single post
 * POST /api/posts/[id]/approve  — approve and publish immediately
 * POST /api/posts/[id]/reject   — reject the draft
 *
 * Note: approve/reject are sub-actions distinguished by a request body
 * or via dedicated sub-routes. We handle the action param here.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { getPost, approvePost, rejectPost } from "@/lib/posts";

type Params = { params: Promise<{ id: string }> };

// ─── GET — fetch single post ──────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);
  const { id } = await params;
  const postId = parseInt(id, 10);

  if (isNaN(postId)) {
    return NextResponse.json({ error: "Invalid post ID" }, { status: 400 });
  }

  const post = getPost(postId, userId);
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  return NextResponse.json({ post });
}

// ─── POST — approve or reject ─────────────────────────────────────────────────
// Clients POST to /api/posts/[id] with body { action: "approve" | "reject" }

export async function POST(
  request: NextRequest,
  { params }: Params
): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);
  const { id } = await params;
  const postId = parseInt(id, 10);

  if (isNaN(postId)) {
    return NextResponse.json({ error: "Invalid post ID" }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;

  if (action === "approve") {
    try {
      const post = await approvePost(postId, userId);
      return NextResponse.json({
        success:  true,
        post_url: post.post_url,
        tweet_ids: post.tweet_ids,
        post,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[posts/${postId}] Approve failed:`, msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (action === "reject") {
    try {
      const post = rejectPost(postId, userId);
      return NextResponse.json({ success: true, post });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: 'action must be "approve" or "reject"' },
    { status: 400 }
  );
}
