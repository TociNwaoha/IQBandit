/**
 * lib/integrations/providers/gmailMcpSync.ts
 *
 * After IQ Bandit's Gmail OAuth callback stores tokens in SQLite,
 * this syncs those same tokens to the mcp-gmail tokens.json file
 * so the mcp-gmail MCP server (and OpenClaw Gmail skill) can use
 * them immediately — no separate `npm run oauth` needed.
 *
 * Controlled by MCP_GMAIL_TOKEN_DB_PATH in .env.local.
 * No-op (silent skip) if that env var is not set.
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

import fs   from "node:fs/promises";
import path from "node:path";

/**
 * Writes IQ Bandit's Gmail tokens to the mcp-gmail tokens.json file
 * in the format the mcp-gmail server expects.
 *
 * Called after OAuth callback and after every token refresh so both
 * systems stay in sync automatically.
 */
export async function syncTokensToMcpGmail(params: {
  accessToken:    string;
  refreshToken?:  string | null;
  /** Seconds until the access token expires (from Google token response) */
  expiresIn?:     number;
  scope?:         string;
  email?:         string | null;
}): Promise<void> {
  const tokenPath = process.env.MCP_GMAIL_TOKEN_DB_PATH;
  if (!tokenPath) return; // Not configured — skip silently

  const accountId = process.env.GMAIL_ACCOUNT_ID ?? "default";

  // Read existing file to preserve any other accounts (multi-account support)
  let store: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(tokenPath, "utf-8");
    store = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet or is invalid JSON — start fresh
  }

  const existing = store[accountId] as Record<string, unknown> | undefined;

  store[accountId] = {
    account_id:    accountId,
    access_token:  params.accessToken,
    // Preserve old refresh_token if the new response doesn't include one
    // (Google only returns a new refresh_token on initial auth, not on refresh)
    refresh_token: params.refreshToken ?? existing?.refresh_token ?? null,
    token_type:    "Bearer",
    // mcp-gmail expects expiry as Unix epoch milliseconds
    expires_at:    Date.now() + (params.expiresIn ?? 3600) * 1000,
    scope:         params.scope ?? "https://www.googleapis.com/auth/gmail.readonly",
    email:         params.email ?? existing?.email ?? null,
  };

  // Ensure the target directory exists before writing
  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(store, null, 2), "utf-8");
}
