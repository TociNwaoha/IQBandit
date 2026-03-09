import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { WORKSPACE_FILES, readWorkspaceFile, writeWorkspaceFile, type WorkspaceFile } from "@/lib/workspace";
import type { NextRequest } from "next/server";

const ALLOWED = new Set<string>(WORKSPACE_FILES);

/** GET /api/workspace/[file] — return single file content */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { file } = await params;
  if (!ALLOWED.has(file)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const content = readWorkspaceFile(file as WorkspaceFile);
  if (content === null) return NextResponse.json({ content: "" });
  return NextResponse.json({ content });
}

/** PUT /api/workspace/[file] — write single file */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { file } = await params;
  if (!ALLOWED.has(file)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { content?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }

  writeWorkspaceFile(file as WorkspaceFile, body.content);
  return NextResponse.json({ ok: true });
}
