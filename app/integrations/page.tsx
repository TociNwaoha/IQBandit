/**
 * app/integrations/page.tsx
 * Protected page — shows the integration catalogue grouped by category,
 * augmented with live connection status from the tool_connections table.
 *
 * Server component: fetches registry + DB connections at request time.
 * Interactive buttons are handled by IntegrationCardActions (client component).
 */

import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import {
  PROVIDERS,
  getCategoriesWithProviders,
  getProvidersByCategory,
  type IntegrationProvider,
  type AuthType,
  type ProviderStatus,
} from "@/lib/integrations/providerRegistry";
import {
  listConnections,
  type ProviderConnection,
  type ConnectionStatus,
} from "@/lib/integrations/connections";
import { IntegrationCardActions } from "./IntegrationCardActions";
import { getActionsForProvider }  from "@/lib/integrations/toolRouter";
import {
  getMetaOAuthConfig,
  MetaOAuthNotConfiguredError,
} from "@/lib/integrations/providers/metaAdsConfig";
import {
  getGmailOAuthConfig,
  GmailOAuthNotConfiguredError,
} from "@/lib/integrations/providers/gmailConfig";

// ─── style constants ──────────────────────────────────────────────────────────

const MONO: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "13px",
  color: "#1a1a17",
};

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e8e8e4",
  borderRadius: "8px",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

// ─── badge helpers ────────────────────────────────────────────────────────────

const AUTH_COLORS: Record<AuthType, { bg: string; color: string; label: string }> = {
  oauth2:  { bg: "#ede9fe", color: "#5b21b6", label: "OAuth 2.0" },
  api_key: { bg: "#f0f9ff", color: "#0369a1", label: "API key"   },
  none:    { bg: "#f7f7f4", color: "#6b6b60", label: "No auth"   },
  webhook: { bg: "#ecfdf5", color: "#065f46", label: "Webhook"   },
};

const STATUS_COLORS: Record<ProviderStatus, { bg: string; color: string }> = {
  planned: { bg: "#f7f7f4", color: "#6b6b60" },
  beta:    { bg: "#fffbeb", color: "#92400e" },
  live:    { bg: "#f0fdf4", color: "#166534" },
};

const CONN_COLORS: Record<ConnectionStatus | "none", { bg: string; color: string; label: string }> = {
  connected:    { bg: "#f0fdf4", color: "#166534", label: "Connected"     },
  expired:      { bg: "#fffbeb", color: "#92400e", label: "Expired"       },
  error:        { bg: "#fef2f2", color: "#991b1b", label: "Error"         },
  disconnected: { bg: "#f7f7f4", color: "#6b6b60", label: "Disconnected"  },
  none:         { bg: "#f7f7f4", color: "#a8a89c", label: "Not connected" },
};

function AuthBadge({ type }: { type: AuthType }) {
  const s = AUTH_COLORS[type];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "99px",
        fontSize: "11px",
        fontWeight: 600,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

function StatusBadge({ status }: { status: ProviderStatus }) {
  const s = STATUS_COLORS[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "99px",
        fontSize: "11px",
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

function RWBadge({
  supportsRead,
  supportsWrite,
}: Pick<IntegrationProvider, "supportsRead" | "supportsWrite">) {
  const parts: string[] = [];
  if (supportsRead) parts.push("R");
  if (supportsWrite) parts.push("W");
  return (
    <span style={{ fontSize: "11px", color: "#a8a89c" }}>{parts.join(" / ")}</span>
  );
}

function ConnectionChip({ status }: { status: ConnectionStatus | null }) {
  const key = status ?? "none";
  const s = CONN_COLORS[key] ?? CONN_COLORS.none;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "99px",
        fontSize: "11px",
        fontWeight: 600,
        background: s.bg,
        color: s.color,
      }}
    >
      {s.label}
    </span>
  );
}

// ─── provider card ────────────────────────────────────────────────────────────

function ProviderCard({
  p,
  connection,
  oauthStartUrl,
  configWarning,
}: {
  p: IntegrationProvider;
  connection?: ProviderConnection;
  oauthStartUrl?: string;
  configWarning?: string;
}) {
  const connStatus  = connection?.status ?? null;
  const isConnected = connStatus === "connected";
  const actionDefs  = getActionsForProvider(p.id);
  const actionCount = isConnected && actionDefs ? actionDefs.length : 0;

  return (
    <div style={CARD}>
      {/* Name + provider status */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}
      >
        <span style={{ fontWeight: 700, fontSize: "13px" }}>{p.displayName}</span>
        <StatusBadge status={p.status} />
      </div>

      {/* Description */}
      <p style={{ fontSize: "12px", color: "#6b6b60", margin: 0, lineHeight: 1.5 }}>
        {p.description}
      </p>

      {/* Meta row: auth · exec mode · R/W */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          marginTop: "2px",
        }}
      >
        <AuthBadge type={p.preferredAuthType} />
        <span style={{ fontSize: "11px", color: "#c8c8bc" }}>·</span>
        <span style={{ fontSize: "11px", color: "#a8a89c" }}>{p.executionMode}</span>
        <span style={{ fontSize: "11px", color: "#c8c8bc" }}>·</span>
        <RWBadge supportsRead={p.supportsRead} supportsWrite={p.supportsWrite} />
      </div>

      {/* Connection status + action buttons */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
          paddingTop: "8px",
          borderTop: "1px solid #f3f3f0",
          marginTop: "2px",
        }}
      >
        <ConnectionChip status={connStatus} />
        {connStatus === "expired" && (
          <span style={{ fontSize: "11px", color: "#92400e" }}>
            Token expired — reconnect to resume tool execution.
          </span>
        )}
        {connection?.account_label && (
          <span style={{ fontSize: "11px", color: "#a8a89c" }}>
            {connection.account_label}
          </span>
        )}
        {actionCount > 0 && (
          <span style={{ fontSize: "11px", color: "#059669" }}>
            {actionCount} action{actionCount !== 1 ? "s" : ""} available
          </span>
        )}
        <div style={{ marginLeft: "auto" }}>
          <IntegrationCardActions
            providerId={p.id}
            connectionMethod={p.connectionMethod}
            hasConnection={isConnected}
            credentialLabel={p.credentialLabel}
            oauthStartUrl={oauthStartUrl}
          />
        </div>
      </div>

      {/* Amber config-warning banner — shown when required OAuth env vars are missing */}
      {configWarning && (
        <div
          style={{
            padding: "6px 10px",
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: "5px",
            fontSize: "11px",
            color: "#78350f",
          }}
        >
          {configWarning}
        </div>
      )}
    </div>
  );
}

// ─── OAuth start URLs ─────────────────────────────────────────────────────────

/**
 * Map of provider IDs → their OAuth start route URL.
 * Only providers with a real implemented OAuth flow appear here.
 * All others continue to show the disabled "Connect via OAuth" stub.
 */
const OAUTH_START_URLS: Record<string, string> = {
  notion:   "/api/integrations/oauth/notion/start",
  meta_ads: "/api/integrations/oauth/meta/start",
  gmail:    "/api/integrations/oauth/gmail/start",
};

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function IntegrationsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const sp = await searchParams;

  // Fetch live connection data — graceful if DB not yet initialized
  let connections: ProviderConnection[] = [];
  try {
    connections = listConnections("default");
  } catch {
    // DB unavailable on first run — all providers show "Not connected"
  }
  const connMap = new Map(connections.map((c) => [c.provider_id, c]));

  // Check whether Meta OAuth is fully configured server-side.
  // Uses the same validation path as the start/callback routes so the set of
  // required vars is never out of sync between UI and server.
  let metaOAuthConfigured  = false;
  let metaConfigWarning: string | undefined;
  try {
    getMetaOAuthConfig();
    metaOAuthConfigured = true;
  } catch (err) {
    if (err instanceof MetaOAuthNotConfiguredError) {
      metaConfigWarning =
        `Meta OAuth not configured on server (missing ${err.missingKeys.join(", ")}).`;
    }
  }

  // Same check for Gmail OAuth.
  let gmailOAuthConfigured  = false;
  let gmailConfigWarning: string | undefined;
  try {
    getGmailOAuthConfig();
    gmailOAuthConfigured = true;
  } catch (err) {
    if (err instanceof GmailOAuthNotConfiguredError) {
      gmailConfigWarning =
        `Gmail OAuth not configured on server (missing ${err.missingKeys.join(", ")}).`;
    }
  }

  const categories = getCategoriesWithProviders();
  const totalProviders = PROVIDERS.length;
  const connectedCount = connections.filter((c) => c.status === "connected").length;
  const liveCount = PROVIDERS.filter((p) => p.status === "live").length;
  const betaCount = PROVIDERS.filter((p) => p.status === "beta").length;
  const plannedCount = PROVIDERS.filter((p) => p.status === "planned").length;

  // ── OAuth result banner ────────────────────────────────────────────────────
  const bannerOk   = sp.connected;
  const bannerErr  = sp.error;

  return (
    <div className="min-h-screen bg-gray-50">
    <TopNav activePath="/integrations" email={session.email} />
    <main style={{ ...MONO, padding: "24px", maxWidth: "960px", margin: "0 auto" }}>
      {/* OAuth result banner */}
      {bannerOk && (
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 14px",
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: "6px",
            fontSize: "12px",
            color: "#166534",
          }}
        >
          Connected to <strong>{bannerOk}</strong> successfully.
        </div>
      )}
      {bannerErr && (
        <div
          style={{
            marginBottom: "16px",
            padding: "10px 14px",
            background: "#fef2f2",
            border: "1px solid #fca5a5",
            borderRadius: "6px",
            fontSize: "12px",
            color: "#991b1b",
          }}
        >
          Connection failed: <code style={{ fontFamily: "monospace" }}>{bannerErr}</code>
        </div>
      )}

      {/* Header */}
      <h1 style={{ marginBottom: "4px", fontSize: "16px", fontWeight: 600 }}>
        Integrations
      </h1>
      <p style={{ marginBottom: "8px", color: "#6b6b60" }}>
        {totalProviders} providers across {categories.length} categories
        {connectedCount > 0 && ` · ${connectedCount} connected`}
        {liveCount > 0 && ` · ${liveCount} live`}
        {betaCount > 0 && ` · ${betaCount} beta`}
        {plannedCount > 0 && ` · ${plannedCount} planned`}
      </p>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "28px",
          fontSize: "11px",
          color: "#a8a89c",
          borderTop: "1px solid #e8e8e4",
          paddingTop: "12px",
        }}
      >
        <span>
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#ede9fe",
              border: "1px solid #8b5cf6",
              marginRight: "5px",
              verticalAlign: "middle",
            }}
          />
          OAuth 2.0
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#f0f9ff",
              border: "1px solid #38bdf8",
              marginRight: "5px",
              verticalAlign: "middle",
            }}
          />
          API key
        </span>
        <span>
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#ecfdf5",
              border: "1px solid #34d399",
              marginRight: "5px",
              verticalAlign: "middle",
            }}
          />
          Webhook
        </span>
        <span style={{ marginLeft: "auto" }}>R = read · W = write</span>
      </div>

      {/* Category sections */}
      {categories.map((category) => {
        const providers = getProvidersByCategory(category);
        return (
          <section key={category} style={{ marginBottom: "32px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <h2 style={{ fontSize: "13px", fontWeight: 700, margin: 0 }}>
                {category}
              </h2>
              <span style={{ fontSize: "11px", color: "#a8a89c" }}>
                {providers.length} provider{providers.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "10px",
              }}
            >
              {providers.map((p) => {
                const misconfigured =
                  (p.id === "meta_ads" && !metaOAuthConfigured) ||
                  (p.id === "gmail"    && !gmailOAuthConfigured);
                const configWarning =
                  p.id === "meta_ads" && !metaOAuthConfigured ? metaConfigWarning :
                  p.id === "gmail"    && !gmailOAuthConfigured ? gmailConfigWarning :
                  undefined;
                return (
                  <ProviderCard
                    key={p.id}
                    p={p}
                    connection={connMap.get(p.id)}
                    oauthStartUrl={misconfigured ? undefined : OAUTH_START_URLS[p.id]}
                    configWarning={configWarning}
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Footer */}
      <p
        style={{
          marginTop: "8px",
          paddingTop: "16px",
          borderTop: "1px solid #e8e8e4",
          fontSize: "11px",
          color: "#a8a89c",
        }}
      >
        All providers are currently in the planning stage. Connection flows will be
        added progressively. Set INTEGRATIONS_ENCRYPTION_SECRET before storing any
        tokens.
      </p>
    </main>
    </div>
  );
}
