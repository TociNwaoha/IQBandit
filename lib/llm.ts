/**
 * lib/llm.ts
 * Provider-agnostic LLM adapter interface.
 *
 * CURRENT PROVIDERS:
 *   "openclaw" — proxy requests through the OpenClaw gateway (default)
 *   "disabled" — chat UI is hidden; dashboard/health still work
 *
 * ADDING A PROVIDER LATER (e.g. OpenAI, Anthropic):
 *   1. Add its name to ChatMode below
 *   2. Implement LLMProvider for it in a new lib/providers/<name>.ts file
 *   3. Update getChatMode() to accept the new value
 *   4. Update the chat route to branch on the new mode
 *
 * ⚠  getChatMode() reads process.env — SERVER-SIDE ONLY.
 *    Never import getChatMode in "use client" components.
 */

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "@/lib/openclaw";
import { getSettings } from "@/lib/settings";

// Re-export the shared types so callers can use a single import
export type { ChatCompletionRequest, ChatCompletionResponse };

// ---------------------------------------------------------------------------
// Chat mode
// ---------------------------------------------------------------------------

/**
 * Controls which backend handles chat completions.
 *   "openclaw" — forward to the OpenClaw gateway REST API
 *   "disabled" — chat is not available (gateway is WS-only / not yet wired up)
 */
export type ChatMode = "openclaw" | "disabled";

/**
 * Reads STARTCLAW_CHAT_MODE from the environment.
 * Falls back to "openclaw" if unset or unrecognized.
 * SERVER-SIDE ONLY — do not call from client components.
 */
export function getChatMode(): ChatMode {
  const raw = getSettings().STARTCLAW_CHAT_MODE;
  if (raw === "openclaw" || raw === "disabled") return raw;
  return "openclaw";
}

// ---------------------------------------------------------------------------
// Provider interface (scaffold — wire up in the chat route when needed)
// ---------------------------------------------------------------------------

/**
 * Implement this interface to add a new LLM provider.
 * The chat route calls provider.chatCompletion() and returns the result.
 */
export interface LLMProvider {
  /** Human-readable name for logs and UI (e.g. "OpenClaw", "OpenAI") */
  readonly name: string;

  /** Send a chat completion request and return a normalized response */
  chatCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse>;
}
