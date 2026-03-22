/**
 * app/api/auth/me/route.ts
 * Returns current user data from JWT.
 * GET — requires auth.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth-helpers";
import { getUserById } from "@/lib/user-db";

export async function GET(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = getUserById(auth.userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  return NextResponse.json({
    userId:         user.id,
    email:          user.email,
    name:           user.name,
    avatarUrl:      user.avatar_url,
    plan:           user.plan,
    onboardingDone: user.onboarding_done,
    agentName:      user.agent_name,
    useCase:        user.use_case,
    createdAt:      user.created_at,
  });
}
