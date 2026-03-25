/**
 * app/api/openclaw/chat/route.ts
 * Proxies chat completion requests to the OpenClaw gateway.
 * Supports both non-streaming (JSON response) and streaming (SSE) modes.
 *
 * Auth-gated: OPENCLAW_GATEWAY_TOKEN never leaves the server.
 * Rate-limited: 20 requests / 60 seconds per session email (or IP).
 * Logged: every request is recorded to ./logs/requests.db (or .ndjson fallback).
 *
 * Error codes returned to the client (in the `code` field of the JSON body):
 *   RATE_LIMITED          — too many requests from this session
 *   CHAT_DISABLED         — STARTCLAW_CHAT_MODE=disabled
 *   GATEWAY_TIMEOUT       — upstream fetch exceeded the 30-second timeout
 *   GATEWAY_NOT_REACHABLE — network error (OpenClaw process not running)
 *   ENDPOINT_NOT_FOUND    — gateway returned 404 (no REST chat route)
 *   METHOD_NOT_ALLOWED    — gateway returned 405 (wrong HTTP method/path)
 *   NOT_REST_COMPATIBLE   — gateway returned non-JSON (HTML, WebSocket page, etc.)
 *   AUTH_ERROR            — gateway returned 401/403 (bad token)
 *   GATEWAY_ERROR         — gateway returned 500/502/503 or other errors
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ChatMessage, ChatCompletionRequest, ChatCompletionResponse } from "@/lib/openclaw";
import { getSettings } from "@/lib/settings";
import { getChatMode } from "@/lib/llm";
import { getInstanceByUserId } from "@/lib/instances";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { getUserById, deductCredits } from "@/lib/user-db";
import { decrypt } from "@/lib/crypto";
import { BANDIT_LM } from "@/lib/plans";
import { logChatRequest } from "@/lib/logger";
import { checkRateLimit, getRateLimitKey } from "@/lib/ratelimit";
import {
  addMessage, upsertMessage,
  updateConversationMeta, autoTitleFromFirstMessage,
} from "@/lib/conversations";
import { getAgent } from "@/lib/agents";
import { logToolAudit, type ConsentTool } from "@/lib/toolAudit";
import { getDepartmentPolicy, resolveEffectiveAgentSettings } from "@/lib/departmentPolicies";
import { gmailSearch }          from "@/lib/mcp/gmail";
import { isMcpGmailConfigured }    from "@/lib/mcp/stdioClient";
import { randomUUID } from "crypto";
import { buildWorkspaceContext } from "@/lib/workspace";

// ---------------------------------------------------------------------------
// Request body shape
// ---------------------------------------------------------------------------

export interface ChatRequestBody {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  /** Set to true to receive a streaming SSE response instead of a single JSON object */
  stream?: boolean;
  /** If provided, the user message and assistant response are persisted to this conversation. */
  conversationId?: string;
  /**
   * Optional stable UUID for the user's message.
   * When provided, the server uses INSERT OR IGNORE — safe to retry without duplicates.
   * If omitted a fresh UUID is generated server-side.
   */
  userMessageId?: string;
  /**
   * The agent ID for this conversation, used for tool consent enforcement.
   * When provided, the server checks the agent's ask_before_tools/ask_before_web/ask_before_files settings.
   */
  agentId?: string;
  /**
   * When true, the server may return { type: "tool_intent", intent: {...} } instead of
   * calling the gateway, if the message appears to require a guarded tool and the agent
   * requires consent for that tool.
   */
  toolConsentMode?: boolean;
  /**
   * When provided, the server logs the audit decision and bypasses consent checking,
   * proceeding directly to the gateway call.
   */
  toolConsentOverride?: { tool: ConsentTool; allowOnce: true };
}

// ---------------------------------------------------------------------------
// Tool intent detection — deterministic heuristic
// ---------------------------------------------------------------------------

interface ToolIntent {
  tool:    ConsentTool;
  reason:  string;
  query?:  string;
  action?: "search" | "read"; // Gmail-specific
}

const GMAIL_PATTERNS = [
  /\bemails?\b/i, /\bgmail\b/i, /\binbox\b/i,
  /check\s+my\s+(emails?|gmail|inbox|mail)\b/i,
  /search\s+(my\s+)?(emails?|gmail|inbox|mail)\b/i,
  /\b(latest|recent|new|last)\s+\d*\s*emails?\b/i,
  /\bmost\s+recent\s+\d*\s*emails?\b/i,
  /\bfind\s+(the\s+)?emails?\b/i,
  /\bemails?\s+(about|from|regarding)\b/i,
  /\bfrom\s+my\s+(inbox|emails?|gmail|mail)\b/i,
  /\bin\s+my\s+(inbox|emails?|gmail|mail)\b/i,
  /\bsummariz[ei]\s+.*emails?\b/i,
  /\bmy\s+(unread\s+)?emails?\b/i,
  /\bshow\s+(me\s+)?(my\s+)?emails?\b/i,
  /\bget\s+(my\s+)?emails?\b/i,
];

const WEB_PATTERNS = [
  /\bsearch\b/i, /\bbrowse\b/i, /\blook\s*up\b/i, /\bfind\s+online\b/i,
  /\blatest\b/i, /\bcurrent\b/i, /\bnews\b/i, /\bverify\b/i,
  /\bwhat.s\s+happening\b/i, /\brecent\b/i, /\btoday\b/i, /\bcheck\s+online\b/i,
];

const FILE_PATTERNS = [
  /check\s+my\s+files?\b/i, /\bin\s+my\s+docs?\b/i, /read\s+the\s+pdf\b/i,
  /from\s+the\s+handoff\b/i, /in\s+the\s+uploaded\s+file\b/i, /search\s+documents?\b/i,
  /from\s+my\s+files?\b/i, /\bpdf\b/i, /\bdocument\b/i, /\bspreadsheet\b/i,
];

/**
 * Extracts a usable Gmail search query from natural language.
 * Tries to pull "from:X", keyword phrases, or falls back to key terms.
 */
function buildGmailQuery(text: string): string {
  // General "show me recent / new emails" requests → inbox newest-first
  if (/\b(most\s+recent|latest|last\s+\d+|newest|\d+\s+recent|\d+\s+new|new\s+emails?|any\s+new|list\s+(my\s+)?(recent|latest|new))\b/i.test(text)) {
    return "in:inbox";
  }

  const fromMatch = text.match(/\bfrom\s+([^\s,.!?]{2,40}(?:\s+[^\s,.!?]{2,20})?)/i);
  if (fromMatch) return `from:${fromMatch[1].trim()}`;
  const aboutMatch = text.match(/\b(?:about|regarding|subject)[:\s]+([^,.!?]{3,60})/i);
  if (aboutMatch) return aboutMatch[1].trim();

  // Strip common/filler words; keep only likely search terms (names, topics)
  const cleaned = text
    .replace(/\b(search|find|check|summarize|get|show|list|tell|give|any|new|my|gmail|emails?|inbox|latest|recent|most|the|an?|i|me|you|look|look\s+up|in|from|for|unread|do|have|got|there|what|are|is)\b/gi, " ")
    .replace(/[^\w\s@.:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

  // If ≤ 3 meaningful words remain, use them as a specific search query;
  // otherwise the message is too complex / off-topic → return inbox
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  if (!cleaned || wordCount > 3) return "in:inbox";

  return cleaned;
}

/**
 * Returns the Gmail search query from the previous user message if it had Gmail
 * intent, or null if the previous exchange was not Gmail-related.
 * "Previous" = the user message immediately before the current (last) one.
 */
function getPreviousGmailQuery(
  messages: Array<{ role: string; content: string }>,
): string | null {
  const userMsgs = messages.filter((m) => m.role === "user");
  const prevUserMsg = userMsgs.at(-2); // -1 is current, -2 is one exchange back
  if (!prevUserMsg) return null;
  const isGmail = GMAIL_PATTERNS.some((re) => re.test(prevUserMsg.content));
  return isGmail ? buildGmailQuery(prevUserMsg.content) : null;
}

function detectToolIntent(text: string): ToolIntent | null {
  const hasGmail = GMAIL_PATTERNS.some((re) => re.test(text));
  const hasFiles = FILE_PATTERNS.some((re) => re.test(text));
  const hasWeb   = WEB_PATTERNS.some((re) => re.test(text));

  if (!hasGmail && !hasFiles && !hasWeb) return null;

  // GMAIL takes highest priority when email is explicitly referenced
  if (hasGmail) {
    const q = buildGmailQuery(text);
    return {
      tool:   "gmail",
      action: "search",
      reason: "This agent wants to search your Gmail to answer your question.",
      query:  q.slice(0, 120),
    };
  }

  // FILES take priority over WEB (local / safer)
  if (hasFiles) {
    const m = text.match(/(?:read|search|check|from)[^\w]*(.*)/i);
    return {
      tool:   "files",
      reason: "This agent wants to search or read from your files to answer your question.",
      query:  m?.[1]?.slice(0, 120).trim() || undefined,
    };
  }

  // WEB intent
  const m = text.match(/(?:search|look\s*up|browse|find)[^\w]*(.*)/i);
  return {
    tool:   "web",
    reason: "This agent wants to search the web to answer your question.",
    query:  m?.[1]?.slice(0, 120).trim() || undefined,
  };
}

// ---------------------------------------------------------------------------
// Helper: count total characters in the prompt messages
// Used for logging — not sent to the gateway.
// ---------------------------------------------------------------------------

function countPromptChars(messages: ChatMessage[]): number {
  return messages.reduce((sum, msg) => sum + (msg.content?.length ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Helper: translate raw gateway errors into user-friendly codes and messages.
//
// Full technical details (URLs, stack traces) are logged server-side only.
// The client only ever sees a clean diagnostic message.
// ---------------------------------------------------------------------------

interface ChatErrorResult {
  code: string;
  message: string;
}

function parseChatError(err: Error): ChatErrorResult {
  const msg = err.message;

  // AbortSignal.timeout() fires a DOMException with name "TimeoutError"
  if (err.name === "TimeoutError" || msg.includes("TimeoutError") || msg.includes("The operation was aborted")) {
    return {
      code: "GATEWAY_TIMEOUT",
      message:
        "Gateway did not respond in time (30-second timeout). " +
        "Make sure OpenClaw is running and responsive.",
    };
  }

  // Network-level failure — OpenClaw process is not running, or URL is wrong
  if (
    msg.includes("ECONNREFUSED") ||
    msg.includes("fetch failed") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("ETIMEDOUT")
  ) {
    return {
      code: "GATEWAY_NOT_REACHABLE",
      message:
        "Gateway is not reachable. Make sure OpenClaw is running and " +
        "OPENCLAW_GATEWAY_URL points to the right address.",
    };
  }

  // 404 — gateway is up but this path isn't registered as a REST endpoint
  if (msg.includes("[404]")) {
    return {
      code: "ENDPOINT_NOT_FOUND",
      message:
        "Gateway responded but the chat endpoint was not found (404). " +
        "This OpenClaw instance may not expose a REST chat API yet. " +
        "Set STARTCLAW_CHAT_MODE=disabled to hide the playground until it is.",
    };
  }

  // 405 — the gateway rejected the HTTP method (POST) on this path
  if (msg.includes("[405]")) {
    return {
      code: "METHOD_NOT_ALLOWED",
      message:
        "Gateway rejected the request method (405). " +
        "The chat endpoint may not accept POST on the configured path. " +
        "Check OPENCLAW_CHAT_PATH in .env.local.",
    };
  }

  // 401 / 403 — bearer token is wrong, expired, or missing
  if (msg.includes("[401]") || msg.includes("[403]")) {
    return {
      code: "AUTH_ERROR",
      message:
        "Gateway rejected the request (auth error). " +
        "Check that OPENCLAW_GATEWAY_TOKEN is correct.",
    };
  }

  // 500 / 502 / 503 — gateway-side server error
  if (
    msg.includes("[500]") ||
    msg.includes("[502]") ||
    msg.includes("[503]")
  ) {
    return {
      code: "GATEWAY_ERROR",
      message:
        "The gateway returned a server error. Check the OpenClaw process logs.",
    };
  }

  // JSON parse failure — gateway returned HTML or a WebSocket upgrade page
  if (
    msg.includes("Unexpected token") ||
    msg.includes("is not valid JSON") ||
    msg.toLowerCase().includes("syntaxerror")
  ) {
    return {
      code: "NOT_REST_COMPATIBLE",
      message:
        "Gateway returned a non-JSON response (possibly an HTML control UI or " +
        "WebSocket endpoint). The REST chat API may not be configured yet. " +
        "Set STARTCLAW_CHAT_MODE=disabled to hide the playground until it is.",
    };
  }

  // Anything else — pass through without leaking internal details
  return {
    code: "GATEWAY_ERROR",
    message: msg,
  };
}

// ---------------------------------------------------------------------------
// Per-user gateway routing
// ---------------------------------------------------------------------------

interface GwConfig { url: string; token: string; chatPath: string }

/**
 * Resolves the gateway URL + token for a request.
 * If the user has a running container (instance.openclaw_url + gateway_token),
 * those take priority over the global env var / settings values.
 * Falls back to global settings for dev/admin single-instance mode.
 */
function resolveGateway(
  instance: ReturnType<typeof getInstanceByUserId>,
): GwConfig {
  const s = getSettings();
  if (
    instance?.status === "running" &&
    instance.openclaw_url &&
    instance.gateway_token
  ) {
    return {
      url:      instance.openclaw_url,
      token:    instance.gateway_token,
      chatPath: s.OPENCLAW_CHAT_PATH,
    };
  }
  // Global fallback (dev mode / single-user deploy)
  return {
    url:      s.OPENCLAW_GATEWAY_URL,
    token:    s.OPENCLAW_GATEWAY_TOKEN,
    chatPath: s.OPENCLAW_CHAT_PATH,
  };
}

/** Non-streaming gateway POST — returns parsed JSON response. */
async function gwPost(cfg: GwConfig, body: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const endpoint = `${cfg.url}${cfg.chatPath}`;
  console.log(`[openclaw] → POST ${endpoint}`);
  const res = await fetch(endpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
    body:    JSON.stringify(body),
    cache:   "no-store",
    signal:  AbortSignal.timeout(30_000),
  });
  console.log(`[openclaw] ← ${res.status} ${endpoint}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenClaw gateway error [${res.status}]: ${text || res.statusText}`);
  }
  return res.json() as Promise<ChatCompletionResponse>;
}

/** Streaming gateway POST — returns raw Response so the body can be piped. */
async function gwStream(cfg: GwConfig, body: ChatCompletionRequest): Promise<Response> {
  const endpoint = `${cfg.url}${cfg.chatPath}`;
  console.log(`[openclaw] stream → POST ${endpoint}`);
  const res = await fetch(endpoint, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.token}` },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(30_000),
  });
  console.log(`[openclaw] stream ← ${res.status} ${endpoint}`);
  return res;
}

// ---------------------------------------------------------------------------
// Direct LLM helpers (BanditLM / BYOK — bypass OpenClaw gateway)
// ---------------------------------------------------------------------------

/** Non-streaming direct POST to an OpenAI-compatible /chat/completions endpoint. */
async function directPost(
  url: string,
  apiKey: string,
  body: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  console.log(`[openclaw] direct → POST ${url}`);
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify(body),
    cache:   "no-store",
    signal:  AbortSignal.timeout(60_000),
  });
  console.log(`[openclaw] direct ← ${res.status} ${url}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM error [${res.status}]: ${text || res.statusText}`);
  }
  return res.json() as Promise<ChatCompletionResponse>;
}

/** Streaming direct POST to an OpenAI-compatible /chat/completions endpoint. */
async function directStream(
  url: string,
  apiKey: string,
  body: ChatCompletionRequest,
): Promise<Response> {
  console.log(`[openclaw] direct stream → POST ${url}`);
  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(60_000),
  });
  console.log(`[openclaw] direct stream ← ${res.status} ${url}`);
  return res;
}

// ---------------------------------------------------------------------------
// POST /api/openclaw/chat
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  // getSession() reads and verifies the signed JWT cookie.
  // Returns null if the cookie is absent, expired, or tampered with.
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 1b. Per-user container routing ───────────────────────────────────────
  // Look up the user's provisioned OpenClaw container from the instances table.
  // If found, use its openclaw_url + gateway_token instead of the global env vars.
  // Falls back to global settings when no running instance exists (dev / admin mode).
  const userId   = getCurrentUserIdFromSession(session);
  const instance = getInstanceByUserId(userId);
  const gw       = resolveGateway(instance);

  // ── 1c. Determine LLM routing mode ───────────────────────────────────────
  // BanditLM  → call DeepSeek directly using DEEPSEEK_API_KEY
  // BYOK      → call the user's own provider using their stored (encrypted) key
  // Otherwise → forward to the OpenClaw gateway (existing path)
  const freshUser  = getUserById(userId);
  const isByok     = freshUser?.model_mode === "byok" && !!freshUser.byok_api_key;
  const isBanditLM = !isByok && (freshUser?.model_mode === "banditlm" || !freshUser?.model_mode);

  // Credit guard — block before any work is done
  if (isBanditLM && (freshUser?.credits_usd ?? 5) <= 0) {
    return NextResponse.json(
      { error: "Your BanditLM credits are used up. Upgrade to continue.", code: "CREDITS_EMPTY", upgrade: true },
      { status: 402 },
    );
  }

  // ── Instance guard ────────────────────────────────────────────────────────
  // Every user needs a running OpenClaw container. BanditLM users without one
  // are auto-provisioned in the background; BYOK users get a support message.
  if (!instance || instance.status !== "running") {
    if (isBanditLM) {
      const baseUrl = process.env.APP_INTERNAL_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
      fetch(`${baseUrl}/api/provision`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": request.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({ plan: "free" }),
      }).catch(() => {});
      return NextResponse.json(
        { error: "Provisioning your agent — please retry in a moment.", provisioning: true },
        { status: 202 },
      );
    }
    return NextResponse.json(
      { error: "Your agent container is not running. Please contact support." },
      { status: 503 },
    );
  }

  // ── 2. Rate limiting ─────────────────────────────────────────────────────
  // Check BEFORE feature flags and body parsing — it's the cheapest check.
  // Key prefers session email (authenticated identity) over IP.
  const rateLimitKey = getRateLimitKey(request, session.email);
  const rl = checkRateLimit(rateLimitKey);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests. Please wait before sending another message.",
        code: "RATE_LIMITED",
      },
      {
        status: 429,
        headers: {
          // Retry-After is a standard HTTP header (RFC 7231 §7.1.3).
          // Clients can read it to show a "try again in X seconds" countdown.
          "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 60_000) / 1000)),
        },
      }
    );
  }

  // ── 3. Feature flag ──────────────────────────────────────────────────────
  // STARTCLAW_CHAT_MODE=disabled disables chat without breaking health/auth.
  // Useful when the gateway doesn't yet expose a REST chat endpoint.
  const chatMode = getChatMode();
  if (chatMode === "disabled") {
    return NextResponse.json(
      {
        error:
          "Chat is not configured for this instance. " +
          "Set STARTCLAW_CHAT_MODE=openclaw in .env.local when your REST endpoint is ready.",
        code: "CHAT_DISABLED",
      },
      { status: 503 }
    );
  }

  // ── 4. Parse and validate body ───────────────────────────────────────────
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    model, messages, temperature, max_tokens, stream,
    conversationId, userMessageId,
    agentId, toolConsentMode, toolConsentOverride,
  } = body;

  if (!model || typeof model !== "string") {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages must be a non-empty array" },
      { status: 400 }
    );
  }

  // ── 4b. Tool consent enforcement ─────────────────────────────────────────
  // Gmail is checked FIRST, independently of agent settings — it only requires
  // that the Gmail OAuth connection is active. The client signals it can handle
  // consent modals by sending toolConsentMode: true.
  // Conversational continuity: if the current message has no Gmail signal but
  // the previous user message did, treat this as a Gmail follow-up.
  if (toolConsentMode && !toolConsentOverride) {
    const lastUserMsg = messages.slice().reverse().find((m) => m.role === "user");
    if (lastUserMsg?.content) {
      const intent = detectToolIntent(lastUserMsg.content);

      // Direct Gmail signal on current message
      let gmailIntent = intent?.tool === "gmail" ? intent : null;

      // Conversation continuity: no direct signal, but previous exchange was Gmail
      if (!gmailIntent) {
        const prevQuery = getPreviousGmailQuery(messages);
        if (prevQuery !== null) {
          // Only continue if the current message doesn't strongly suggest a different tool
          const hasOtherIntent = intent?.tool === "web" || intent?.tool === "files";
          if (!hasOtherIntent) {
            gmailIntent = {
              tool:   "gmail",
              action: "search",
              reason: "Continuing Gmail search from the previous message.",
              query:  prevQuery,
            };
          }
        }
      }

      if (gmailIntent) {
        // Trigger consent when MCP Gmail is configured (env var present).
        // If not configured, fall through so the model answers naturally.
        if (isMcpGmailConfigured()) {
          return NextResponse.json({
            type:   "tool_intent",
            intent: {
              tool:   "gmail",
              action: gmailIntent.action ?? "search",
              reason: gmailIntent.reason,
              query:  gmailIntent.query ?? null,
            },
          }, { status: 200, headers: { "Cache-Control": "no-store, private" } });
        }
        // MCP Gmail not configured — fall through so model can answer naturally
      }
    }
  }

  // Web / Files consent — requires an agent with ask_before_tools enabled.
  // Uses EFFECTIVE settings (department policy + optional agent overrides) so that
  // department-level policy is respected even when the agent has not individually
  // changed a setting.
  if (agentId && toolConsentMode && !toolConsentOverride) {
    const agent = getAgent(agentId);
    if (agent) {
      const policy    = agent.department ? getDepartmentPolicy(agent.department) : null;
      const effective = resolveEffectiveAgentSettings(agent, policy);

      if (effective.ask_before_tools) {
        const lastUserMsg = messages.slice().reverse().find((m) => m.role === "user");
        if (lastUserMsg?.content) {
          const intent = detectToolIntent(lastUserMsg.content);
          // Gmail already handled above — only process web/files here
          if (intent && intent.tool !== "gmail") {
            const isWebTool   = intent.tool === "web";
            const toolAllowed = isWebTool ? effective.allow_web   : effective.allow_files;
            const askBefore   = isWebTool ? effective.ask_before_web : effective.ask_before_files;

            if (toolAllowed && askBefore) {
              return NextResponse.json({
                type:   "tool_intent",
                intent: {
                  tool:   intent.tool,
                  reason: intent.reason,
                  query:  intent.query ?? null,
                },
              }, { status: 200, headers: { "Cache-Control": "no-store, private" } });
            }
          }
        }
      }
    }
  }

  // If toolConsentOverride is provided, log the audit decision (allow_once) with policy_source
  if (toolConsentOverride?.allowOnce && agentId) {
    const agent = getAgent(agentId);
    const policy = agent?.department ? getDepartmentPolicy(agent.department) : null;
    const effective = agent ? resolveEffectiveAgentSettings(agent, policy) : null;
    const isWebOrGmail = toolConsentOverride.tool === "web";
    const policySource: "department" | "agent_override" =
      effective
        ? (isWebOrGmail ? (agent!.override_ask_before_web   ? "agent_override" : "department")
                        : (agent!.override_ask_before_files  ? "agent_override" : "department"))
        : "department";

    logToolAudit({
      conversation_id: typeof conversationId === "string" ? conversationId : "",
      agent_id:        agentId,
      tool:            toolConsentOverride.tool,
      decision:        "allow_once",
      reason:          "User allowed this tool for this request",
      policy_source:   policySource,
    });
  }

  // ── 4c. Gmail execution — inject results into messages when user approved ──
  // When toolConsentOverride.tool === "gmail", call the MCP Gmail server and
  // prepend a compact system context block so the model answers with live data.
  // Consent logic and audit logging (above) are kept exactly as-is.
  // ── 4d. Inject workspace context + agent system prompt ───────────────────
  // Build a system message from ~/.openclaw/workspace/ files + agent.system_prompt.
  // Agent's default_model overrides the client-supplied model when set.
  let msgToSend = messages;
  const agentRecord  = agentId ? getAgent(agentId) : null;
  const agentPrompt  = agentRecord?.system_prompt?.trim() ?? "";
  const resolvedModel = (agentRecord?.default_model?.trim() || model) as string;
  // For BanditLM/BYOK direct calls, use the correct model id — not the gateway model name.
  const effectiveModel = isBanditLM
    ? BANDIT_LM.model_id
    : isByok
      ? (freshUser!.byok_model_id ?? resolvedModel)
      : resolvedModel;

  const workspaceCtx = buildWorkspaceContext({ includeMemory: true, includeTools: true });
  const systemContent = [workspaceCtx, agentPrompt].filter(Boolean).join("\n\n---\n\n");

  if (systemContent) {
    const hasSystem = (msgToSend as { role: string }[]).some((m) => m.role === "system");
    if (!hasSystem) {
      msgToSend = [{ role: "system", content: systemContent } as ChatMessage, ...msgToSend];
    }
  }

  if (toolConsentOverride?.tool === "gmail" && toolConsentOverride.allowOnce) {
    const lastUserMsg = messages.slice().reverse().find((m) => m.role === "user");
    if (lastUserMsg?.content) {
      const searchQuery = buildGmailQuery(lastUserMsg.content);
      let gmailContext  = "";

      try {
        // ── MCP Gmail search ───────────────────────────────────────────────
        const results = await gmailSearch({ q: searchQuery, maxResults: 5 });

        if (results.length === 0) {
          gmailContext =
            `[GMAIL SEARCH — fetched live right now for query "${searchQuery}": ` +
            `No matching emails found. Do not use email data from earlier in this conversation.]`;
        } else {
          // Each result already carries from / subject / date / snippet / id
          const rows = results.map((r) =>
            `From: ${r.from}\nSubject: ${r.subject}\nDate: ${r.date}\n` +
            `Snippet: ${r.snippet.slice(0, 250)}\nID: ${r.id}`,
          );
          gmailContext =
            `[GMAIL RESULTS — fetched live right now for query "${searchQuery}". ` +
            `Answer using ONLY these emails; ignore any email data from earlier in this conversation.]\n\n` +
            rows.join("\n\n---\n\n") +
            `\n\n[END GMAIL RESULTS]`;
        }

        // Prepend Gmail context as a system message
        msgToSend = [{ role: "system", content: gmailContext }, ...messages];

      } catch (err) {
        // ── MCP failure — return a clear error immediately; do NOT hallucinate ──
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[/api/openclaw/chat] Gmail MCP error: ${errMsg}`);

        // Log the failure as a denied audit event
        if (agentId) {
          logToolAudit({
            conversation_id: typeof conversationId === "string" ? conversationId : "",
            agent_id:        agentId,
            tool:            "gmail",
            decision:        "deny",
            reason:          `gmail_access_failed: ${errMsg.slice(0, 200)}`,
            policy_source:   "department",
          });
        }

        // Return a friendly, non-hallucinated assistant response
        return NextResponse.json({
          choices: [{
            message: {
              role:    "assistant",
              content:
                "I couldn't access Gmail right now. Please make sure the Gmail MCP server " +
                "is running — run `npm run oauth` then `npm run dev` inside the mcp-gmail folder, " +
                "and ensure MCP_GMAIL_ARGS is set in IQ Bandit's .env.local. Then try again.",
            },
          }],
        }, { status: 200 });
      }
    }
  }

  // ── 5. Shared logging setup ───────────────────────────────────────────────
  // startTime and promptChars are used in both the streaming and non-streaming
  // paths to populate the log entry.
  const startTime = Date.now();
  const promptChars = countPromptChars(msgToSend);

  // ── 6. STREAMING PATH ────────────────────────────────────────────────────
  // When the client sends { stream: true }, we pipe the raw SSE response from
  // the gateway straight through to the client without buffering.
  //
  // We use a TransformStream as a "spy" in the middle of the pipe:
  // it passes every chunk through unchanged, but counts bytes so we can log
  // the total response size once the stream finishes.
  if (stream === true) {
    // Call the gateway and get a raw Response (body not read yet)
    let gatewayResponse: Response;
    try {
      const streamBody = { model: effectiveModel, messages: msgToSend, temperature, max_tokens, stream: true };
      gatewayResponse = await gwStream(gw, streamBody as ChatCompletionRequest);
    } catch (err) {
      // Network-level failure (ECONNREFUSED, DNS, timeout, etc.)
      const raw = err instanceof Error ? err : new Error(String(err));
      const { code, message } = parseChatError(raw);
      console.error(`[/api/openclaw/chat] stream network error: ${raw.message}`);
      logChatRequest({
        timestamp: new Date().toISOString(),
        email: session.email,
        model,
        latency_ms: Date.now() - startTime,
        success: false,
        error_message: raw.message,
        prompt_chars: promptChars,
        response_chars: 0,
      });
      return NextResponse.json({ error: message, code }, { status: 502 });
    }

    // If the gateway returned a non-2xx status, the body will be a JSON error
    // (not an SSE stream). Read it now and return a diagnostic response.
    if (!gatewayResponse.ok) {
      const errText = await gatewayResponse.text().catch(() => "");
      const syntheticErr = new Error(
        `OpenClaw gateway error [${gatewayResponse.status}]: ${errText}`
      );
      const { code, message } = parseChatError(syntheticErr);
      console.error(`[/api/openclaw/chat] stream gateway error: ${syntheticErr.message}`);
      logChatRequest({
        timestamp: new Date().toISOString(),
        email: session.email,
        model,
        latency_ms: Date.now() - startTime,
        success: false,
        error_message: syntheticErr.message,
        prompt_chars: promptChars,
        response_chars: 0,
      });
      return NextResponse.json({ error: message, code }, { status: 502 });
    }

    // Defensive guard — a 2xx streaming response should always have a body
    if (!gatewayResponse.body) {
      return NextResponse.json(
        { error: "Gateway returned an empty body", code: "GATEWAY_ERROR" },
        { status: 502 }
      );
    }

    // Build the TransformStream that counts bytes as they pass through.
    // The `flush` callback fires once the upstream (gateway) closes the stream,
    // at which point we have the full response size and can write the log row.
    let responseChars = 0;

    const countingTransform = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        // chunk.length = number of bytes in this SSE data packet
        // For ASCII text (standard SSE) this equals character count exactly.
        responseChars += chunk.length;
        // Enqueue passes the chunk downstream to the client, unchanged.
        controller.enqueue(chunk);
      },
      flush() {
        // Stream is complete — log the full entry now
        logChatRequest({
          timestamp: new Date().toISOString(),
          email: session.email,
          model,
          latency_ms: Date.now() - startTime,
          success: true,
          error_message: "",
          prompt_chars: promptChars,
          response_chars: responseChars,
        });
        // Deduct BanditLM credits (estimated from char counts)
        if (isBanditLM && freshUser) {
          const cost =
            (Math.ceil(promptChars   / 4) * BANDIT_LM.input_rate) +
            (Math.ceil(responseChars / 4) * BANDIT_LM.output_rate);
          deductCredits(freshUser.id, cost);
        }
        console.log(
          `[/api/openclaw/chat] stream done — model=${model} ` +
          `latency=${Date.now() - startTime}ms bytes=${responseChars}`
        );
      },
    });

    // Connect the gateway body → counting transform → client
    // pipeTo() rejects if the client disconnects mid-stream — catch it to avoid
    // unhandled promise rejections (client disconnect is normal, not an error).
    gatewayResponse.body.pipeTo(countingTransform.writable).catch(() => {});

    // Return the readable end of the transform as the response.
    // IMPORTANT: Use `new Response()` here, NOT `NextResponse.json()`.
    // NextResponse buffers the entire body before sending — that defeats streaming.
    return new Response(countingTransform.readable, {
      status: 200,
      headers: {
        // text/event-stream tells the browser this is an SSE stream
        "Content-Type": "text/event-stream",
        // no-cache prevents the browser from buffering SSE events
        "Cache-Control": "no-cache",
        // X-Accel-Buffering: no tells nginx (if present) not to buffer either
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── 7. NON-STREAMING PATH ────────────────────────────────────────────────
  // Default path when stream is false or omitted.
  // chatCompletion() handles the gateway call and JSON parsing.
  try {
    const nonStreamBody = { model: effectiveModel, messages: msgToSend, temperature, max_tokens, stream: false };
    const completion = await gwPost(gw, nonStreamBody as ChatCompletionRequest);

    const assistantContent = completion.choices?.[0]?.message?.content ?? "";
    const responseChars = assistantContent.length;

    logChatRequest({
      timestamp: new Date().toISOString(),
      email: session.email,
      model,
      latency_ms: Date.now() - startTime,
      success: true,
      error_message: "",
      prompt_chars: promptChars,
      response_chars: responseChars,
    });

    // Deduct BanditLM credits (non-streaming path)
    if (isBanditLM && freshUser) {
      const cost =
        (Math.ceil(promptChars   / 4) * BANDIT_LM.input_rate) +
        (Math.ceil(responseChars / 4) * BANDIT_LM.output_rate);
      deductCredits(freshUser.id, cost);
    }

    // ── Conversation persistence ────────────────────────────────────────────
    // Non-fatal: a DB failure here must never break the chat response.
    if (conversationId && typeof conversationId === "string" && assistantContent) {
      try {
        // The last user-role message in the array is the new message just sent.
        const lastUserMsg = messages.slice().reverse().find((m) => m.role === "user");

        // Use upsertMessage (INSERT OR IGNORE) for the user turn so retries are safe.
        const uid = typeof userMessageId === "string" && userMessageId.trim()
          ? userMessageId.trim()
          : randomUUID();
        if (lastUserMsg) upsertMessage(uid, conversationId, "user", lastUserMsg.content);

        // Assistant message is always fresh — generated once per successful response.
        addMessage(conversationId, "assistant", assistantContent);

        // Auto-title from the first user message (canonical helper — 42 chars max,
        // only fires when title is still "New Chat").
        if (lastUserMsg?.content) {
          autoTitleFromFirstMessage(conversationId, lastUserMsg.content);
        }
        updateConversationMeta(conversationId, { model });
      } catch {
        console.error("[/api/openclaw/chat] conversation persistence failed (non-fatal)");
      }
    }

    return NextResponse.json(completion, { status: 200 });
  } catch (err) {
    const raw = err instanceof Error ? err : new Error(String(err));
    const { code, message } = parseChatError(raw);

    // Log full technical details server-side only
    console.error(`[/api/openclaw/chat] ${code}: ${raw.message}`);

    logChatRequest({
      timestamp: new Date().toISOString(),
      email: session.email,
      model,
      latency_ms: Date.now() - startTime,
      success: false,
      error_message: raw.message,
      prompt_chars: promptChars,
      response_chars: 0,
    });

    // Return a clean diagnostic response — no internal URLs or stack traces
    return NextResponse.json({ error: message, code }, { status: 502 });
  }
}

// ---------------------------------------------------------------------------
// 405 Method Not Allowed
// Define this explicitly so we control the response body and the Allow header.
// (RFC 9110 §15.5.6 requires the Allow header on a 405 response.)
// Without this, Next.js returns its own generic 405 with no JSON body.
// ---------------------------------------------------------------------------

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST.", code: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "POST" } }
  );
}

// Reuse the same handler for all other unsupported methods
export const PUT = GET;
export const DELETE = GET;
export const PATCH = GET;

// ---------------------------------------------------------------------------
// Backend test checklist — run from a terminal while `npm run dev` is active
// ---------------------------------------------------------------------------
//
// Prerequisites: replace $EMAIL and $PASS with your STARTCLAW_ADMIN_* values.
//
// 1. LOGIN — get a session cookie (save it to cookies.txt for reuse):
//    curl -s -c cookies.txt -X POST http://localhost:3000/api/auth/login \
//      -H "Content-Type: application/json" \
//      -d '{"email":"$EMAIL","password":"$PASS"}' | python3 -m json.tool
//    Expected: {"success":true}
//
// 2. HEALTH CHECK:
//    curl -s -b cookies.txt http://localhost:3000/api/openclaw/health | python3 -m json.tool
//    Expected: {"status":"ok",...}
//
// 3. NON-STREAMING CHAT:
//    curl -s -b cookies.txt -X POST http://localhost:3000/api/openclaw/chat \
//      -H "Content-Type: application/json" \
//      -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Say hi"}]}' \
//      | python3 -m json.tool
//    Expected: OpenAI-compatible JSON with choices[0].message.content
//
// 4. STREAMING CHAT (-N disables curl output buffering so you see chunks live):
//    curl -s -b cookies.txt -N -X POST http://localhost:3000/api/openclaw/chat \
//      -H "Content-Type: application/json" \
//      -d '{"model":"gpt-4o","stream":true,"messages":[{"role":"user","content":"Count 1 to 5"}]}'
//    Expected: SSE lines printed in real-time: data: {...}  data: [DONE]
//
// 5. 405 METHOD NOT ALLOWED:
//    curl -s -X GET http://localhost:3000/api/openclaw/chat | python3 -m json.tool
//    Expected: {"error":"Method not allowed. Use POST.","code":"METHOD_NOT_ALLOWED"} status=405
//    curl -v -X DELETE http://localhost:3000/api/openclaw/chat 2>&1 | grep "< HTTP"
//    Expected: HTTP/1.1 405
//
// 6. RATE LIMIT — send 21 requests quickly:
//    for i in $(seq 1 21); do
//      curl -s -b cookies.txt -X POST http://localhost:3000/api/openclaw/chat \
//        -H "Content-Type: application/json" \
//        -d '{"model":"gpt-4o","messages":[{"role":"user","content":"ping"}]}' \
//        -o /dev/null -w "req $i: %{http_code}\n"
//    done
//    Expected: requests 1–20 return 200 (or 502 if gateway down), request 21 returns 429
//    Check Retry-After header: curl -v ... 2>&1 | grep -i retry-after
//
// 7. UNAUTHENTICATED REQUEST (expect 401):
//    curl -s -X POST http://localhost:3000/api/openclaw/chat \
//      -H "Content-Type: application/json" \
//      -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}' | python3 -m json.tool
//    Expected: {"error":"Unauthorized"} status=401
//
// 8. VERIFY LOG WRITES:
//    # SQLite (if better-sqlite3 installed):
//    sqlite3 logs/requests.db "SELECT id, timestamp, email, model, success, latency_ms FROM chat_requests ORDER BY id DESC LIMIT 5;"
//    # NDJSON fallback (if SQLite unavailable):
//    tail -5 logs/requests.ndjson | python3 -m json.tool
//
// 9. PATH OVERRIDE TEST:
//    Add OPENCLAW_CHAT_PATH=/does-not-exist to .env.local, restart dev server,
//    send a chat request. Expected: ENDPOINT_NOT_FOUND (404 from gateway).
//    Remove the override afterwards.
