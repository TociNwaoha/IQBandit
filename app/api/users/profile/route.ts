import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth-helpers";
import { updateUser } from "@/lib/user-db";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, agentName, useCase } = body as Record<string, unknown>;

  const update: Parameters<typeof updateUser>[1] = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0 || name.length > 100)
      return NextResponse.json({ error: "name must be 1–100 characters" }, { status: 400 });
    update.name = name.trim();
  }
  if (agentName !== undefined) {
    if (typeof agentName !== "string" || agentName.trim().length === 0 || agentName.length > 100)
      return NextResponse.json({ error: "agentName must be 1–100 characters" }, { status: 400 });
    update.agentName = agentName.trim();
  }
  if (useCase !== undefined) {
    if (typeof useCase !== "string" || useCase.length > 100)
      return NextResponse.json({ error: "useCase must be ≤ 100 characters" }, { status: 400 });
    update.useCase = useCase.trim();
  }

  if (Object.keys(update).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  updateUser(auth.userId, update);
  return NextResponse.json({ success: true });
}
