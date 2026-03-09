/**
 * lib/providerPresets.ts
 * Provider preset definitions — shared between the Setup Wizard and Integrations page.
 * Pure data, no imports — safe to use in both server and client components.
 */

export interface ProviderPreset {
  /** Stored as PROVIDER_PRESET in SQLite, e.g. "openclaw" */
  id: string;
  /** Display name shown in the dropdown */
  name: string;
  /**
   * The URL value written to the form when this preset is applied.
   * Empty string = don't prefill (preserve whatever is currently in the field).
   */
  urlDefault: string;
  /** Input placeholder text when the URL field is empty */
  urlPlaceholder: string;
  /** Standard chat completions path for this provider */
  chatPath: string;
  /** Label for the token / API key input */
  tokenLabel: string;
  /** If false, the token is optional and the UI communicates that */
  tokenRequired: boolean;
  /** Short help text shown below the token field */
  helpText: string;
  /** Suggested model identifier to prefill when the default model field is blank */
  defaultModel: string;
}

export const PRESETS: ProviderPreset[] = [
  {
    id: "openclaw",
    name: "OpenClaw",
    urlDefault: "http://127.0.0.1:19001",
    urlPlaceholder: "http://127.0.0.1:19001",
    chatPath: "/v1/chat/completions",
    tokenLabel: "Gateway Token",
    tokenRequired: true,
    helpText: "Use the gateway token from your OpenClaw config.",
    defaultModel: "openclaw:main",
  },
  {
    id: "generic",
    name: "OpenAI-compatible (Generic)",
    urlDefault: "",
    urlPlaceholder: "https://your-openai-compatible-host.com",
    chatPath: "/v1/chat/completions",
    tokenLabel: "API Key",
    tokenRequired: true,
    helpText: "Use a provider API key for any OpenAI-compatible endpoint.",
    defaultModel: "gpt-4o",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    urlDefault: "https://openrouter.ai/api",
    urlPlaceholder: "https://openrouter.ai/api",
    chatPath: "/v1/chat/completions",
    tokenLabel: "API Key",
    tokenRequired: true,
    helpText:
      "Use your OpenRouter API key. Note: test-connection probes the gateway root — OpenRouter's /models endpoint is not checked separately.",
    defaultModel: "openai/gpt-4o",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    urlDefault: "http://127.0.0.1:11434",
    urlPlaceholder: "http://127.0.0.1:11434",
    chatPath: "/v1/chat/completions",
    tokenLabel: "API Key",
    tokenRequired: false,
    helpText:
      "Local Ollama usually does not require an API key. Leave the token blank to connect without authentication.",
    defaultModel: "llama3.2",
  },
  {
    id: "anthropic-proxy",
    name: "Anthropic / Claude (via proxy)",
    urlDefault: "",
    urlPlaceholder: "https://your-anthropic-proxy.com",
    chatPath: "/v1/chat/completions",
    tokenLabel: "API Key",
    tokenRequired: true,
    helpText:
      "⚠ Requires an OpenAI-compatible proxy in front of Anthropic's API (e.g. LiteLLM, one-api). " +
      "IQ BANDIT uses the /v1/chat/completions format — Anthropic's native API (/v1/messages) is not supported directly.",
    defaultModel: "claude-sonnet-4-5",
  },
];

/** All valid preset IDs (plus empty string for "custom / none"). */
export const PRESET_IDS: string[] = PRESETS.map((p) => p.id);

export function getPreset(id: string): ProviderPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
