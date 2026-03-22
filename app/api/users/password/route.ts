import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, verifyPassword, hashPassword } from "@/lib/auth-helpers";
import { getUserById, updateUserPassword } from "@/lib/user-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { currentPassword, newPassword } = body as Record<string, unknown>;

  if (typeof currentPassword !== "string" || typeof newPassword !== "string")
    return NextResponse.json({ error: "currentPassword and newPassword are required" }, { status: 400 });

  if (newPassword.length < 8)
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });

  const user = getUserById(auth.userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!user.password_hash)
    return NextResponse.json({ error: "Google sign-in accounts cannot set a password" }, { status: 400 });

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid)
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });

  const hash = await hashPassword(newPassword);
  updateUserPassword(auth.userId, hash);

  return NextResponse.json({ success: true });
}
