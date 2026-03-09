/**
 * app/api/department-policies/route.ts
 * GET  — fetch one or all department policies.
 * PUT  — update a department policy.
 * POST — reset a department policy to locked defaults.
 *
 * Query params (GET/PUT/POST):
 *   departmentId — required; must be a valid DEPT_ID from lib/departments.ts
 *
 * Auth: session required.
 */

import { NextRequest, NextResponse }   from "next/server";
import { getSession }                  from "@/lib/auth";
import { DEPT_IDS }                    from "@/lib/departments";
import {
  getDepartmentPolicy,
  listDepartmentPolicies,
  upsertDepartmentPolicy,
  resetDepartmentPolicy,
  type DepartmentPolicy,
} from "@/lib/departmentPolicies";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

const VALID_STYLES = new Set(["brief", "balanced", "detailed"]);

function auth(request: NextRequest) {
  return getSession(request);
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await auth(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = request.nextUrl;
  const departmentId = searchParams.get("departmentId");

  if (!departmentId) {
    // Return all policies
    const policies = listDepartmentPolicies();
    return NextResponse.json({ policies }, { headers: NO_STORE });
  }

  if (!DEPT_IDS.has(departmentId)) {
    return NextResponse.json(
      { error: `Unknown departmentId: ${departmentId}` },
      { status: 400, headers: NO_STORE },
    );
  }

  const policy = getDepartmentPolicy(departmentId);
  if (!policy) {
    return NextResponse.json({ error: "Policy not available" }, { status: 503, headers: NO_STORE });
  }

  return NextResponse.json({ policy }, { headers: NO_STORE });
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  const session = await auth(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = request.nextUrl;
  const departmentId = searchParams.get("departmentId");

  if (!departmentId || !DEPT_IDS.has(departmentId)) {
    return NextResponse.json(
      { error: "Valid departmentId query param is required" },
      { status: 400, headers: NO_STORE },
    );
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const raw = body as Record<string, unknown>;
  const patch: Partial<Omit<DepartmentPolicy, "department_id" | "updated_at">> = {};

  if (typeof raw.allow_web        === "boolean") patch.allow_web        = raw.allow_web;
  if (typeof raw.allow_files      === "boolean") patch.allow_files      = raw.allow_files;
  if (typeof raw.ask_before_tools === "boolean") patch.ask_before_tools = raw.ask_before_tools;
  if (typeof raw.ask_before_web   === "boolean") patch.ask_before_web   = raw.ask_before_web;
  if (typeof raw.ask_before_files === "boolean") patch.ask_before_files = raw.ask_before_files;
  if (typeof raw.response_style   === "string" && VALID_STYLES.has(raw.response_style)) {
    patch.response_style = raw.response_style as DepartmentPolicy["response_style"];
  }

  const updated = upsertDepartmentPolicy(departmentId, patch);
  if (!updated) {
    return NextResponse.json({ error: "Failed to update policy" }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ policy: updated }, { headers: NO_STORE });
}

// ── POST (reset) ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await auth(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = request.nextUrl;
  const departmentId = searchParams.get("departmentId");

  if (!departmentId || !DEPT_IDS.has(departmentId)) {
    return NextResponse.json(
      { error: "Valid departmentId query param is required" },
      { status: 400, headers: NO_STORE },
    );
  }

  const reset = resetDepartmentPolicy(departmentId);
  if (!reset) {
    return NextResponse.json({ error: "Failed to reset policy" }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ policy: reset }, { headers: NO_STORE });
}
