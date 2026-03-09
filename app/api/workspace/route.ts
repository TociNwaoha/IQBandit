import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { WORKSPACE_FILES, readWorkspaceFile, type WorkspaceFile } from "@/lib/workspace";
import type { NextRequest } from "next/server";

/** GET /api/workspace — return all workspace files as { filename: content } */
export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result: Record<string, string> = {};
  for (const f of WORKSPACE_FILES) {
    result[f] = readWorkspaceFile(f as WorkspaceFile) ?? "";
  }
  return NextResponse.json(result);
}
