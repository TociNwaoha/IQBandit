/**
 * lib/integrations/providers/metaAdsConfig.ts
 *
 * Single source of truth for Meta Ads OAuth environment-variable validation.
 * Both the OAuth start route and the OAuth callback route import from here so
 * that the required env vars are documented and enforced in exactly one place.
 *
 * Required env vars:
 *   META_APP_ID              — App ID from Meta for Developers App Dashboard
 *   META_APP_SECRET          — App Secret from Meta for Developers App Dashboard
 *   META_OAUTH_REDIRECT_URI  — must match exactly what is registered in the Meta app
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetaOAuthConfig {
  appId:       string;
  appSecret:   string;
  redirectUri: string;
}

// ─── Typed error ──────────────────────────────────────────────────────────────

export class MetaOAuthNotConfiguredError extends Error {
  readonly code        = "META_OAUTH_NOT_CONFIGURED" as const;
  readonly missingKeys: string[];

  constructor(missingKeys: string[]) {
    super(
      `Meta Ads OAuth is not configured. Missing env var${missingKeys.length > 1 ? "s" : ""}: ` +
      missingKeys.join(", "),
    );
    this.name        = "MetaOAuthNotConfiguredError";
    this.missingKeys = missingKeys;
  }
}

// ─── Config getter ────────────────────────────────────────────────────────────

/**
 * Returns the validated Meta OAuth config object.
 * Throws {@link MetaOAuthNotConfiguredError} listing every missing env var if
 * any of the three required variables are absent.
 */
export function getMetaOAuthConfig(): MetaOAuthConfig {
  const missing: string[] = [];

  const appId       = process.env.META_APP_ID;
  const appSecret   = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;

  if (!appId)       missing.push("META_APP_ID");
  if (!appSecret)   missing.push("META_APP_SECRET");
  if (!redirectUri) missing.push("META_OAUTH_REDIRECT_URI");

  if (missing.length > 0) throw new MetaOAuthNotConfiguredError(missing);

  // All three are non-null here: the throw above fires if any is missing.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { appId: appId!, appSecret: appSecret!, redirectUri: redirectUri! };
}

// ─── Startup diagnostic ───────────────────────────────────────────────────────

/**
 * Logs a [META_ADS] warning to the server console if any required env var is
 * missing. Intended for module-level calls in route files so missing config is
 * visible immediately at server boot rather than only on the first user request.
 *
 * Safe to call from server components and API routes alike (no-op when fully
 * configured).
 */
export function warnIfMetaMisconfigured(): void {
  try {
    getMetaOAuthConfig();
  } catch (err) {
    if (err instanceof MetaOAuthNotConfiguredError) {
      const n = err.missingKeys.length;
      console.warn(
        `[META_ADS] OAuth unavailable — missing env var${n > 1 ? "s" : ""}: ` +
        `${err.missingKeys.join(", ")}. ` +
        `Add them to .env.local (see .env.local.example). ` +
        `The Connect button on /integrations will be disabled until they are set.`,
      );
    }
  }
}
