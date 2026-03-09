/**
 * app/api/integrations/execute-approved/route.ts
 * POST — executes a previously approved tool call.
 *
 * POST body: { approval_id: string }
 *
 * Success (200): { result: <action-specific payload> }
 * Errors:
 *   400 — invalid body
 *   401 — no session
 *   403 — approval belongs to a different user
 *   404 — approval not found
 *   409 — approval not in "approved" status
 *   502 — provider API error
 */

import { NextRequest, NextResponse }   from "next/server";
import { getSession }                  from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import {
  getApprovalById,
  updateApprovalMetadata,
}                                       from "@/lib/approvals";
import { executeAction, ToolRouterError, NotionAdapterError, MetaAdapterError, GmailAdapterError } from "@/lib/integrations/toolRouter";
import { logToolCall }                 from "@/lib/integrations/toolLogger";
import { isToolAllowed }               from "@/lib/agents";
import { getConversationAgentId }      from "@/lib/conversations";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function POST(request: NextRequest) {
  // ── auth ────────────────────────────────────────────────────────────────────
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const userId = getCurrentUserIdFromSession(session);

  // ── parse body ───────────────────────────────────────────────────────────────
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400, headers: NO_STORE });
  }
  const raw = body as Record<string, unknown>;

  const ALLOWED_KEYS = new Set(["approval_id"]);
  const unknownKeys  = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      { error: `Unknown field(s): ${unknownKeys.map((k) => `"${k}"`).join(", ")}` },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!raw.approval_id || typeof raw.approval_id !== "string") {
    return NextResponse.json({ error: '"approval_id" is required and must be a string' }, { status: 400, headers: NO_STORE });
  }
  const approvalId = raw.approval_id.trim();

  // ── load approval ────────────────────────────────────────────────────────────
  const approval = getApprovalById(approvalId, userId);
  if (!approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404, headers: NO_STORE });
  }
  if (approval.status !== "approved") {
    return NextResponse.json(
      { error: `Approval is not in 'approved' status (current: ${approval.status})`, code: "APPROVAL_NOT_READY" },
      { status: 409, headers: NO_STORE },
    );
  }

  // ── parse stored input ───────────────────────────────────────────────────────
  let input: Record<string, unknown> = {};
  try { input = JSON.parse(approval.input_json) as Record<string, unknown>; } catch { /* use empty */ }

  const providerId = approval.provider_id;
  const action     = approval.action;

  // ── re-validate agent allowlist (trust anchor) ───────────────────────────────
  // Determine agent from metadata if available (no conversation context here)
  const storedMeta = (() => {
    try { return JSON.parse(approval.metadata_json) as Record<string, unknown>; } catch { return {}; }
  })();
  const agentId = (storedMeta.agent_id as string | undefined) ?? "";

  // Also check conversation context if conversation_id was stored
  const convId = (storedMeta.conversation_id as string | undefined) ?? "";
  const resolvedAgentId = convId ? (getConversationAgentId(convId) ?? agentId) : agentId;

  if (resolvedAgentId && !isToolAllowed(resolvedAgentId, providerId, action)) {
    return NextResponse.json(
      { error: "This agent does not have permission to use this tool.", code: "TOOL_NOT_ALLOWED" },
      { status: 403, headers: NO_STORE },
    );
  }

  // ── execute ──────────────────────────────────────────────────────────────────
  const startTime = Date.now();
  try {
    const result = await executeAction(providerId, action, input, userId);
    const latency_ms = Date.now() - startTime;

    logToolCall({
      provider_id:     providerId,
      action,
      success:         true,
      latency_ms,
      user_id:         userId,
      agent_id:        resolvedAgentId,
      conversation_id: convId,
      approval_id:     approvalId,
    });

    updateApprovalMetadata(approvalId, userId, {
      ...storedMeta,
      executed_at: new Date().toISOString(),
      execution_latency_ms: latency_ms,
      execution_success: true,
    });

    return NextResponse.json({ result }, { headers: NO_STORE });

  } catch (err) {
    const latency_ms = Date.now() - startTime;
    const isAdapterError = err instanceof ToolRouterError || err instanceof NotionAdapterError
      || err instanceof MetaAdapterError || err instanceof GmailAdapterError;
    const errorCode = isAdapterError ? (err as { code?: string }).code ?? "PROVIDER_API_ERROR" : "UNEXPECTED_ERROR";
    const message   = err instanceof Error ? err.message : "Unknown error";

    logToolCall({
      provider_id:     providerId,
      action,
      success:         false,
      latency_ms,
      error_code:      errorCode,
      message,
      user_id:         userId,
      agent_id:        resolvedAgentId,
      conversation_id: convId,
      approval_id:     approvalId,
    });

    updateApprovalMetadata(approvalId, userId, {
      ...storedMeta,
      executed_at: new Date().toISOString(),
      execution_latency_ms: latency_ms,
      execution_success: false,
      execution_error: message,
    });

    return NextResponse.json(
      { error: message, code: errorCode },
      { status: 502, headers: NO_STORE },
    );
  }
}
