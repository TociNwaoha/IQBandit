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
import { chatCompletion, chatCompletionStream, ChatMessage } from "@/lib/openclaw";
import { getChatMode } from "@/lib/llm";
import { logChatRequest } from "@/lib/logger";
import { checkRateLimit, getRateLimitKey } from "@/lib/ratelimit";

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

  const { model, messages, temperature, max_tokens, stream } = body;

  if (!model || typeof model !== "string") {
    return NextResponse.json({ error: "model is required" }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages must be a non-empty array" },
      { status: 400 }
    );
  }

  // ── 5. Shared logging setup ───────────────────────────────────────────────
  // startTime and promptChars are used in both the streaming and non-streaming
  // paths to populate the log entry.
  const startTime = Date.now();
  const promptChars = countPromptChars(messages);

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
      gatewayResponse = await chatCompletionStream({
        model,
        messages,
        temperature,
        max_tokens,
        stream: true,
      });
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
    const completion = await chatCompletion({
      model,
      messages,
      temperature,
      max_tokens,
      stream: false,
    });

    const responseChars =
      completion.choices?.[0]?.message?.content?.length ?? 0;

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
