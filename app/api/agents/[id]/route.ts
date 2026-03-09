/**
 * app/api/agents/[id]/route.ts
 * GET — fetch a single agent by ID
 * PUT — update an agent's mutable fields
 */

import { NextRequest, NextResponse }        from "next/server";
import { getSession }                      from "@/lib/auth";
import { getAgent, updateAgent, type ResponseStyle } from "@/lib/agents";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404, headers: NO_STORE });

  return NextResponse.json({ agent }, { headers: NO_STORE });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const raw = body as Record<string, unknown>;
  const VALID_STYLES = new Set<ResponseStyle>(["brief", "balanced", "detailed"]);

  const patch: Parameters<typeof updateAgent>[1] = {};
  if (typeof raw.name             === "string")  patch.name             = raw.name;
  if (typeof raw.description      === "string")  patch.description      = raw.description;
  if (typeof raw.system_prompt    === "string")  patch.system_prompt    = raw.system_prompt;
  if (typeof raw.default_model    === "string")  patch.default_model    = raw.default_model;
  if (typeof raw.allow_web        === "boolean") patch.allow_web        = raw.allow_web;
  if (typeof raw.allow_files      === "boolean") patch.allow_files      = raw.allow_files;
  if (typeof raw.ask_before_tools === "boolean") patch.ask_before_tools = raw.ask_before_tools;
  if (typeof raw.ask_before_web   === "boolean") patch.ask_before_web   = raw.ask_before_web;
  if (typeof raw.ask_before_files === "boolean") patch.ask_before_files = raw.ask_before_files;
  if (typeof raw.response_style   === "string" && VALID_STYLES.has(raw.response_style as ResponseStyle)) {
    patch.response_style = raw.response_style as ResponseStyle;
  }
  // v8 — per-setting override flags
  if (typeof raw.override_allow_web        === "boolean") patch.override_allow_web        = raw.override_allow_web;
  if (typeof raw.override_allow_files      === "boolean") patch.override_allow_files      = raw.override_allow_files;
  if (typeof raw.override_ask_before_tools === "boolean") patch.override_ask_before_tools = raw.override_ask_before_tools;
  if (typeof raw.override_ask_before_web   === "boolean") patch.override_ask_before_web   = raw.override_ask_before_web;
  if (typeof raw.override_ask_before_files === "boolean") patch.override_ask_before_files = raw.override_ask_before_files;
  if (typeof raw.override_response_style   === "boolean") patch.override_response_style   = raw.override_response_style;

  const updated = updateAgent(id, patch);
  if (!updated) return NextResponse.json({ error: "Agent not found" }, { status: 404, headers: NO_STORE });

  return NextResponse.json({ agent: updated }, { headers: NO_STORE });
}
