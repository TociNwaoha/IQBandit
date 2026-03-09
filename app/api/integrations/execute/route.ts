/**
 * app/api/integrations/execute/route.ts
 * POST — provider-agnostic tool execution endpoint.
 *
 * POST body (JSON):
 * {
 *   provider_id: string   — e.g. "notion", "meta_ads"
 *   action:      string   — e.g. "search_pages", "list_campaigns"
 *   input?:      object   — action-specific input (see tool router for per-action schema)
 * }
 *
 * Success (200):
 * { result: <action-specific payload> }
 *
 * Errors:
 *   400 — invalid body / unknown input fields / type errors
 *   401 — no session
 *   404 — unknown provider or action
 *   409 — provider not connected / token unavailable
 *   422 — provider found but adapter not live
 *   502 — provider API returned an error (error + provider_error_code forwarded)
 *   503 — encryption secret not configured
 *
 * See lib/integrations/toolRouter.ts for supported provider/action combinations
 * and per-action input schemas.
 */

import { NextRequest, NextResponse }         from "next/server";
import { getSession }                        from "@/lib/auth";
import { getCurrentUserIdFromSession }       from "@/lib/users";
import {
  executeAction,
  ToolRouterError,
  NotionAdapterError,
  MetaAdapterError,
  GmailAdapterError,
  type ExecuteErrorCode,
}                                            from "@/lib/integrations/toolRouter";
import { logToolCall }                       from "@/lib/integrations/toolLogger";
import { markConnectionStatus }              from "@/lib/integrations/connections";
import { isToolAllowed }                     from "@/lib/agents";
import { getConversationAgentId }            from "@/lib/conversations";
import {
  evaluateApprovalRequirement,
  createApprovalRequest,
}                                            from "@/lib/approvals";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

/** Maps router error codes to HTTP status codes. */
const ERROR_STATUS: Record<ExecuteErrorCode, number> = {
  PROVIDER_NOT_FOUND:        404,
  PROVIDER_NOT_LIVE:         422,
  ACTION_NOT_FOUND:          404,
  PROVIDER_NOT_CONNECTED:    409,
  PROVIDER_TOKEN_EXPIRED:    409, // token revoked/expired — needs reconnect
  PROVIDER_PERMISSION_ERROR: 403, // permission error — check access or reconnect
  ENCRYPTION_NOT_CONFIGURED: 503,
  TOKEN_NOT_AVAILABLE:       409,
  VALIDATION_ERROR:          400,
  PROVIDER_API_ERROR:        502, // kept for type completeness; adapter errors handled below
};

export async function POST(request: NextRequest) {
  // ── auth ────────────────────────────────────────────────────────────────────
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  // ── parse body ───────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400, headers: NO_STORE },
    );
  }

  const raw = body as Record<string, unknown>;

  // Reject unknown top-level keys
  const ALLOWED_KEYS = new Set(["provider_id", "action", "input", "agent_id", "conversation_id"]);
  const unknownKeys  = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      { error: `Unknown field(s): ${unknownKeys.map((k) => `"${k}"`).join(", ")}` },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!raw.provider_id || typeof raw.provider_id !== "string") {
    return NextResponse.json(
      { error: '"provider_id" is required and must be a string' },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!raw.action || typeof raw.action !== "string") {
    return NextResponse.json(
      { error: '"action" is required and must be a string' },
      { status: 400, headers: NO_STORE },
    );
  }

  // input is optional — defaults to {}
  let input: Record<string, unknown> = {};
  if (raw.input !== undefined && raw.input !== null) {
    if (typeof raw.input !== "object" || Array.isArray(raw.input)) {
      return NextResponse.json(
        { error: '"input" must be a JSON object if provided' },
        { status: 400, headers: NO_STORE },
      );
    }
    input = raw.input as Record<string, unknown>;
  }

  // ── resolve user_id + agent + conversation context ───────────────────────────
  const userId      = getCurrentUserIdFromSession(session);
  const providerId  = raw.provider_id.trim();
  const action      = raw.action.trim();
  const startTime   = Date.now();

  const clientAgentId = typeof raw.agent_id       === "string" ? raw.agent_id.trim()       : "";
  const convId        = typeof raw.conversation_id === "string" ? raw.conversation_id.trim() : "";

  let resolvedAgentId: string;

  if (convId) {
    // conversation_id is the trust anchor — always load agent_id from DB, ignore client value
    const dbAgentId = getConversationAgentId(convId) ?? "";

    // If the client also sent an agent_id and it doesn't match, reject immediately
    if (clientAgentId && clientAgentId !== dbAgentId) {
      return NextResponse.json(
        { error: "agent_id does not match the conversation's pinned agent.", code: "AGENT_CONVERSATION_MISMATCH" },
        { status: 400, headers: NO_STORE },
      );
    }

    resolvedAgentId = dbAgentId;
  } else {
    // No conversation_id — use client-provided agent_id directly (manual tool-panel calls)
    resolvedAgentId = clientAgentId;
  }

  // ── agent enforcement ─────────────────────────────────────────────────────────
  if (resolvedAgentId && !isToolAllowed(resolvedAgentId, providerId, action)) {
    logToolCall({
      provider_id:     providerId,
      action,
      success:         false,
      latency_ms:      0,
      error_code:      "TOOL_NOT_ALLOWED",
      user_id:         userId,
      agent_id:        resolvedAgentId,
      conversation_id: convId,
    });
    return NextResponse.json(
      { error: "This agent does not have permission to use this tool.", code: "TOOL_NOT_ALLOWED" },
      { status: 403, headers: NO_STORE },
    );
  }

  // ── approval enforcement ──────────────────────────────────────────────────────
  {
    const evalResult = evaluateApprovalRequirement({
      userId,
      agentId:     resolvedAgentId,
      provider_id: providerId,
      action,
      input,
    });

    if (evalResult.required) {
      const approval = createApprovalRequest({
        userId,
        policy_key:  evalResult.policy_key,
        provider_id: providerId,
        action,
        input,
        metadata:    evalResult.metadata,
      });

      logToolCall({
        provider_id:     providerId,
        action,
        success:         false,
        latency_ms:      0,
        error_code:      "APPROVAL_REQUIRED",
        user_id:         userId,
        agent_id:        resolvedAgentId,
        conversation_id: convId,
        approval_id:     approval?.id ?? "",
      });

      return NextResponse.json(
        {
          error:       "Approval required before this tool can be executed.",
          code:        "APPROVAL_REQUIRED",
          approval_id: approval?.id ?? null,
          policy_key:  evalResult.policy_key,
          metadata:    evalResult.metadata,
        },
        { status: 202, headers: NO_STORE },
      );
    }
  }

  // ── execute ──────────────────────────────────────────────────────────────────
  try {
    const result = await executeAction(providerId, action, input, userId);

    logToolCall({
      provider_id:     providerId,
      action,
      success:         true,
      latency_ms:      Date.now() - startTime,
      user_id:         userId,
      agent_id:        resolvedAgentId,
      conversation_id: convId,
    });

    return NextResponse.json({ result }, { headers: NO_STORE });

  } catch (err) {
    const latency_ms = Date.now() - startTime;

    // Routing / validation / connection errors from the tool router
    if (err instanceof ToolRouterError) {
      logToolCall({
        provider_id:     providerId,
        action,
        success:         false,
        latency_ms,
        error_code:      err.code,
        message:         err.message,
        user_id:         userId,
        agent_id:        resolvedAgentId,
        conversation_id: convId,
      });
      const status = ERROR_STATUS[err.code] ?? 500;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status, headers: NO_STORE },
      );
    }

    // Provider API errors — auto-flip connection status on auth failures, then forward error
    if (err instanceof NotionAdapterError) {
      let statusUpdatedTo: string | undefined;
      if (err.code === "NOTION_UNAUTHORIZED") {
        if (markConnectionStatus(providerId, "expired")) statusUpdatedTo = "expired";
      } else if (err.code === "NOTION_FORBIDDEN") {
        if (markConnectionStatus(providerId, "error")) statusUpdatedTo = "error";
      }
      logToolCall({
        provider_id:         providerId,
        action,
        success:             false,
        latency_ms,
        error_code:          "PROVIDER_API_ERROR",
        provider_error_code: err.code,
        message:             err.message,
        user_id:             userId,
        agent_id:            resolvedAgentId,
        conversation_id:     convId,
        metadata:            statusUpdatedTo ? { status_updated_to: statusUpdatedTo } : undefined,
      });
      return NextResponse.json(
        { error: err.message, provider_error_code: err.code },
        { status: 502, headers: NO_STORE },
      );
    }
    if (err instanceof MetaAdapterError) {
      let statusUpdatedTo: string | undefined;
      if (err.code === "META_UNAUTHORIZED") {
        if (markConnectionStatus(providerId, "expired")) statusUpdatedTo = "expired";
      } else if (err.code === "META_FORBIDDEN") {
        if (markConnectionStatus(providerId, "error")) statusUpdatedTo = "error";
      }
      logToolCall({
        provider_id:         providerId,
        action,
        success:             false,
        latency_ms,
        error_code:          "PROVIDER_API_ERROR",
        provider_error_code: err.code,
        message:             err.message,
        user_id:             userId,
        agent_id:            resolvedAgentId,
        conversation_id:     convId,
        metadata:            statusUpdatedTo ? { status_updated_to: statusUpdatedTo } : undefined,
      });
      return NextResponse.json(
        { error: err.message, provider_error_code: err.code },
        { status: 502, headers: NO_STORE },
      );
    }

    if (err instanceof GmailAdapterError) {
      // getValidGmailAccessToken() already marks the connection expired on invalid_grant;
      // guard here handles cases where the adapter itself raises UNAUTHORIZED/FORBIDDEN.
      let statusUpdatedTo: string | undefined;
      if (err.code === "GMAIL_UNAUTHORIZED") {
        if (markConnectionStatus(providerId, "expired")) statusUpdatedTo = "expired";
      } else if (err.code === "GMAIL_FORBIDDEN") {
        if (markConnectionStatus(providerId, "error")) statusUpdatedTo = "error";
      }
      logToolCall({
        provider_id:         providerId,
        action,
        success:             false,
        latency_ms,
        error_code:          "PROVIDER_API_ERROR",
        provider_error_code: err.code,
        message:             err.message,
        user_id:             userId,
        agent_id:            resolvedAgentId,
        conversation_id:     convId,
        metadata:            statusUpdatedTo ? { status_updated_to: statusUpdatedTo } : undefined,
      });
      return NextResponse.json(
        { error: err.message, provider_error_code: err.code },
        { status: 502, headers: NO_STORE },
      );
    }

    logToolCall({
      provider_id:     providerId,
      action,
      success:         false,
      latency_ms,
      error_code:      "UNEXPECTED_ERROR",
      user_id:         userId,
      agent_id:        resolvedAgentId,
      conversation_id: convId,
      message:         err instanceof Error ? err.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Unexpected error during tool execution" },
      { status: 500, headers: NO_STORE },
    );
  }
}
