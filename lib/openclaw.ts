/**
 * lib/openclaw.ts
 * Server-side client for the OpenClaw gateway.
 * NEVER import this in client components — the token lives only here.
 */

import { getSettings } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Per-request config — reads from persisted settings (with env var fallbacks).
// Called on every gateway request so changes in /settings take effect immediately.
// ---------------------------------------------------------------------------
function getConfig() {
  const s = getSettings();
  return {
    url:        s.OPENCLAW_GATEWAY_URL,
    token:      s.OPENCLAW_GATEWAY_TOKEN,
    chatPath:   s.OPENCLAW_CHAT_PATH,
    healthPath: process.env.OPENCLAW_HEALTH_PATH ?? "/health",
  };
}

// Getters so any existing code that references PATHS still works.
export const PATHS = {
  get health()          { return getConfig().healthPath; },
  get chatCompletions() { return getConfig().chatPath; },
};

// ---------------------------------------------------------------------------
// Request / response types (OpenAI-compatible shape)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "length" | "content_filter" | null;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

export interface GatewayHealthResponse {
  status: "ok" | "degraded" | "down";
  message?: string;
  uptime?: number;
}

// ---------------------------------------------------------------------------
// Internal fetch helpers
// ---------------------------------------------------------------------------

function getBaseHeaders(): HeadersInit {
  const { url, token } = getConfig();
  if (!url)   throw new Error("OPENCLAW_GATEWAY_URL is not set");
  if (!token) throw new Error("OPENCLAW_GATEWAY_TOKEN is not set");

  return {
    "Content-Type": "application/json",
    // Bearer token — stays server-side only, never sent to the browser
    Authorization: `Bearer ${token}`,
  };
}

/** JSON-parsing fetch used for authenticated API calls (chat, etc.) */
async function gatewayFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${getConfig().url}${path}`;
  console.log(`[openclaw] → ${options.method ?? "GET"} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      ...getBaseHeaders(),
      ...(options.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000), // 30-second timeout for non-streaming requests
  });

  console.log(`[openclaw] ← ${response.status} ${url}`);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OpenClaw gateway error [${response.status}]: ${text || response.statusText}`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Raw fetch used for health probing — returns Response without parsing or
 * throwing on non-2xx. Caller must have already verified env vars are set.
 * Token is still sent so auth-protected /health endpoints work correctly.
 */
async function gatewayRawFetch(path: string): Promise<Response> {
  const { url, token } = getConfig();
  return fetch(`${url}${path}`, {
    headers: {
      // Auth token stays server-side — never reaches the browser
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000), // 5-second timeout for health probes
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks gateway health with a two-step fallback:
 *
 *  1. GET PATHS.health  — if 2xx JSON with a valid status field, return it.
 *                         if 2xx but non-JSON, return { status: "ok" }.
 *                         if non-2xx or network error, fall through.
 *
 *  2. GET /             — OpenClaw dev mode serves a control UI here even
 *                         when /health isn't wired up.
 *                         if 2xx, return { status: "ok", message: "…" }.
 *
 *  If both probes fail → { status: "down", message: "…" }.
 */
export async function checkGatewayHealth(): Promise<GatewayHealthResponse> {
  const { url, token } = getConfig();
  if (!url)   return { status: "down", message: "OPENCLAW_GATEWAY_URL is not set" };
  if (!token) return { status: "down", message: "OPENCLAW_GATEWAY_TOKEN is not set" };

  // Step 1: dedicated health endpoint
  try {
    const res = await gatewayRawFetch(PATHS.health);
    if (res.ok) {
      // Try structured JSON first — return it if it looks like a health object
      try {
        const data = (await res.json()) as GatewayHealthResponse;
        if (
          data.status === "ok" ||
          data.status === "degraded" ||
          data.status === "down"
        ) {
          return data;
        }
      } catch {
        // 2xx but non-JSON body — gateway is reachable, that's enough
      }
      return { status: "ok", message: "Health endpoint responded" };
    }
    // non-2xx from /health — fall through to root probe
  } catch {
    // network error from /health — fall through to root probe
  }

  // Step 2: root URL fallback
  // OpenClaw dev mode serves a control UI at / even without a /health route
  try {
    const res = await gatewayRawFetch("/");
    if (res.ok) {
      return {
        status: "ok",
        message: "Gateway reachable (control UI responded)",
      };
    }
  } catch {
    // network error from / too — will hit the down return below
  }

  return {
    status: "down",
    message: "Gateway unreachable (tried /health and /)",
  };
}

/**
 * Sends a chat completion request through the gateway.
 * Returns the full OpenAI-compatible response object (JSON-parsed).
 * Use this for non-streaming requests only.
 */
export async function chatCompletion(
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  return gatewayFetch<ChatCompletionResponse>(PATHS.chatCompletions, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

/**
 * Sends a chat completion request and returns the raw Response object.
 * Used for streaming: the caller reads response.body as an SSE stream.
 *
 * Why a separate function instead of reusing gatewayFetch()?
 *   gatewayFetch() calls response.json() which reads and discards the body.
 *   For streaming we need to leave the body unread so we can pipe it.
 *   We also skip `cache: "no-store"` here — that flag can interfere with
 *   streaming response bodies in some Next.js versions.
 *
 * Caller's responsibility:
 *   1. Check response.ok — if false, read response.text() for the error body.
 *   2. Pipe response.body through a TransformStream and return it to the client.
 *   3. NEVER expose GATEWAY_URL or GATEWAY_TOKEN to the client.
 */
export async function chatCompletionStream(
  request: ChatCompletionRequest
): Promise<Response> {
  const { url, token, chatPath } = getConfig();
  if (!url)   throw new Error("OPENCLAW_GATEWAY_URL is not set");
  if (!token) throw new Error("OPENCLAW_GATEWAY_TOKEN is not set");

  const streamUrl = `${url}${chatPath}`;
  console.log(`[openclaw] stream → POST ${streamUrl}`);

  const response = await fetch(streamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Bearer token — stays server-side only, never reaches the browser
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(request),
    // Note: no `cache: "no-store"` here intentionally — see docstring above
    // 30-second timeout covers time-to-first-byte; once headers arrive the
    // stream runs to completion without further timeout interference.
    signal: AbortSignal.timeout(30_000),
  });

  console.log(`[openclaw] stream ← ${response.status} ${streamUrl}`);

  return response;
}
