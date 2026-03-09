/**
 * app/officebuilding/toolSuggester.ts
 * Deterministic rules engine — maps a user message to a tool suggestion.
 *
 * Pure TypeScript. No server imports. Safe to use in client components.
 *
 * Currently wired rules:
 *   1. Notion search_pages   — message mentions searching Notion
 *   2. Meta Ads get_insights — message mentions ad performance / insights
 *
 * Extending: add a new `if` block following the same pattern and update the
 * caller to pass the new provider's `actions` array.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolSuggestion {
  provider_id:      string;
  action:           string;
  /** Prefilled input values from the rule — may be partial. */
  input:            Record<string, string | number>;
  /** Human-readable reason shown in the card. */
  reason:           string;
  /**
   * Required fields the user must fill in before running.
   * Populated when the rule can't extract a value from the message text.
   */
  missingRequired:  { key: string; label: string; placeholder?: string }[];
}

/** Minimal provider shape — matches a subset of the /api/integrations/tools response. */
export interface SlimProvider {
  provider_id: string;
  connected:   boolean;
  actions:     { id: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAvailable(providers: SlimProvider[], pid: string, actionId: string): boolean {
  const p = providers.find((x) => x.provider_id === pid && x.connected);
  return !!p?.actions.find((a) => a.id === actionId);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Returns a ToolSuggestion for the first matching rule, or null if none match.
 *
 * Precedence: Notion > Meta Ads (first rule wins; add ordering adjustments here).
 *
 * @param userText  The raw user message text.
 * @param providers List of providers from GET /api/integrations/tools.
 */
export function suggestTool(
  userText:  string,
  providers: SlimProvider[],
): ToolSuggestion | null {
  const t = userText.toLowerCase();

  // ── Rule 1: Notion search_pages ────────────────────────────────────────────
  // Trigger: message explicitly mentions "notion" AND uses a search verb.
  // "page" / "doc" alone are NOT primary triggers — too many false positives.
  // Guard: notion / search_pages must be connected and available.
  const hasNotionIntent = t.includes("notion");
  const hasSearchVerb = ["search", "find", "look up", "show me"].some((w) =>
    t.includes(w),
  );

  if (hasNotionIntent && hasSearchVerb && isAvailable(providers, "notion", "search_pages")) {
    // Extract a search query by stripping common filler words.
    const query = userText
      .replace(/\b(notion|search|find|look\s+up|show\s+me|in|on|for|the|a|an)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);

    return {
      provider_id:     "notion",
      action:          "search_pages",
      input:           query ? { query } : {},
      reason:          "Your message mentions searching Notion.",
      missingRequired: [],
    };
  }

  // ── Rule 2: Meta Ads get_insights ──────────────────────────────────────────
  // Trigger: message mentions ad performance keywords.
  // If an act_XXXXXXX pattern is found in the text, use it as ad_account_id;
  // otherwise mark the field as missing so the user can fill it in the card.
  const metaKeywords = [
    "meta ads",
    "facebook ads",
    "ad campaign",
    "campaign performance",
    "ad spend",
    "spend",
    "ctr",
    "impressions",
    "roas",
    "insights",
    "campaigns",
  ];
  const hasMetaContext = metaKeywords.some((kw) => t.includes(kw));

  if (hasMetaContext && isAvailable(providers, "meta_ads", "get_insights")) {
    const acctMatch   = userText.match(/\bact_\d+\b/i);
    const adAccountId = acctMatch ? acctMatch[0] : null;

    return {
      provider_id: "meta_ads",
      action:      "get_insights",
      input: {
        date_preset: "last_7d",
        ...(adAccountId ? { ad_account_id: adAccountId } : {}),
      },
      reason:          "Your message mentions Meta Ads performance or insights.",
      missingRequired: adAccountId
        ? []
        : [{ key: "ad_account_id", label: "Ad Account ID", placeholder: "act_123456789" }],
    };
  }

  return null;
}
