/**
 * lib/integrations/providers/gmailConfig.ts
 *
 * Single source of truth for Gmail OAuth environment-variable validation.
 * The OAuth start route, callback route, and token-refresh helper all import
 * from here so the required env vars are documented and enforced in one place.
 *
 * Required env vars:
 *   GMAIL_CLIENT_ID              — OAuth 2.0 Client ID from Google Cloud Console
 *   GMAIL_CLIENT_SECRET          — OAuth 2.0 Client Secret (never logged)
 *   GMAIL_OAUTH_REDIRECT_URI     — must match exactly what is registered in Google Cloud Console
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GmailOAuthConfig {
  clientId:    string;
  clientSecret: string;
  redirectUri: string;
}

// ─── Typed error ──────────────────────────────────────────────────────────────

export class GmailOAuthNotConfiguredError extends Error {
  readonly code        = "GMAIL_OAUTH_NOT_CONFIGURED" as const;
  readonly missingKeys: string[];

  constructor(missingKeys: string[]) {
    super(
      `Gmail OAuth is not configured. Missing env var${missingKeys.length > 1 ? "s" : ""}: ` +
      missingKeys.join(", "),
    );
    this.name        = "GmailOAuthNotConfiguredError";
    this.missingKeys = missingKeys;
  }
}

// ─── Config getter ────────────────────────────────────────────────────────────

/**
 * Returns the validated Gmail OAuth config object.
 * Throws {@link GmailOAuthNotConfiguredError} listing every missing env var if
 * any of the three required variables are absent.
 *
 * Never logs GMAIL_CLIENT_SECRET.
 */
export function getGmailOAuthConfig(): GmailOAuthConfig {
  const missing: string[] = [];

  const clientId    = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI;

  if (!clientId)     missing.push("GMAIL_CLIENT_ID");
  if (!clientSecret) missing.push("GMAIL_CLIENT_SECRET");
  if (!redirectUri)  missing.push("GMAIL_OAUTH_REDIRECT_URI");

  if (missing.length > 0) throw new GmailOAuthNotConfiguredError(missing);

  // All three are non-null here: the throw above fires if any is missing.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { clientId: clientId!, clientSecret: clientSecret!, redirectUri: redirectUri! };
}

// ─── Startup diagnostic ───────────────────────────────────────────────────────

/**
 * Logs a [GMAIL] warning to the server console if any required env var is
 * missing. Intended for module-level calls in route files so missing config is
 * visible immediately at server boot.
 *
 * Safe to call from server components and API routes alike (no-op when fully
 * configured).
 */
export function warnIfGmailMisconfigured(): void {
  try {
    getGmailOAuthConfig();
  } catch (err) {
    if (err instanceof GmailOAuthNotConfiguredError) {
      const n = err.missingKeys.length;
      console.warn(
        `[GMAIL] OAuth unavailable — missing env var${n > 1 ? "s" : ""}: ` +
        `${err.missingKeys.join(", ")}. ` +
        `Add them to .env.local (see .env.local.example). ` +
        `The Connect button on /integrations will be disabled until they are set.`,
      );
    }
  }
}
