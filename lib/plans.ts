/**
 * lib/plans.ts
 * Single source of truth for IQBandit subscription plan definitions.
 * All resource limits (memory, CPU, storage) MUST be read from here —
 * never hardcoded anywhere else in the codebase.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

// ─── types ────────────────────────────────────────────────────────────────────

export type PlanId = "free" | "starter" | "pro" | "bandit_plus";

export interface PlanLimits {
  /** Docker --memory flag value, e.g. "512m" */
  memory: string;
  /** Docker --cpus flag value, e.g. "0.5" */
  cpus: string;
  /** Docker --storage-opt size value, e.g. "5G" */
  storage: string;
  /** Human-readable display label */
  label: string;
  /** Monthly price in USD (undefined for free tier) */
  price_monthly?: number;
  /** Annual price in USD (undefined for free tier) */
  price_annual?: number;
}

// ─── plan definitions ─────────────────────────────────────────────────────────

const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    memory:  "512m",
    cpus:    "0.5",
    storage: "5G",
    label:   "Free",
  },
  starter: {
    memory:        "2048m",
    cpus:          "0.75",
    storage:       "40G",
    label:         "Starter",
    price_monthly: 9.99,
    price_annual:  99.90,
  },
  pro: {
    memory:        "4096m",
    cpus:          "1.5",
    storage:       "80G",
    label:         "Pro",
    price_monthly: 19.99,
    price_annual:  199.90,
  },
  bandit_plus: {
    memory:        "6144m",
    cpus:          "2.0",
    storage:       "160G",
    label:         "Bandit Plus",
    price_monthly: 39.99,
    price_annual:  399.90,
  },
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the resource limits and display info for a given plan.
 * Use this wherever container resources or pricing labels are needed.
 */
export function getPlanLimits(planId: PlanId): PlanLimits {
  return PLANS[planId];
}

/** Daily web search limits per plan (Research Mode). Infinity = unlimited. */
export const SEARCH_LIMITS: Record<PlanId, number> = {
  free:        10,
  starter:     Infinity,
  pro:         Infinity,
  bandit_plus: Infinity,
};

/** Returns all plan IDs in ascending order of tier. */
export const ALL_PLAN_IDS: readonly PlanId[] = [
  "free",
  "starter",
  "pro",
  "bandit_plus",
] as const;

// ─── BanditLM config ──────────────────────────────────────────────────────────

/** BanditLM — IQBandit's built-in AI powered by DeepSeek. */
export const BANDIT_LM = {
  display_name: "BanditLM",
  tagline: "IQBandit's built-in AI — $5 free credits included",
  api_url: "https://api.deepseek.com/v1",
  model_id: "deepseek-chat",
  /** Per-token billing rate for input tokens (USD). */
  input_rate:  1.00 / 1_000_000,
  /** Per-token billing rate for output tokens (USD). */
  output_rate: 5.00 / 1_000_000,
} as const;

/** BYOK providers — OpenAI-compatible endpoints users can connect. */
export const BYOK_PROVIDERS = [
  { id: "openai",    name: "OpenAI",    base_url: "https://api.openai.com/v1",    placeholder: "sk-..." },
  { id: "anthropic", name: "Anthropic", base_url: "https://api.anthropic.com/v1", placeholder: "sk-ant-..." },
  { id: "deepseek",  name: "DeepSeek",  base_url: "https://api.deepseek.com/v1",  placeholder: "sk-..." },
  { id: "custom",    name: "Custom",    base_url: "",                              placeholder: "Any OpenAI-compatible endpoint" },
] as const;

export type ByokProviderId = typeof BYOK_PROVIDERS[number]["id"];
