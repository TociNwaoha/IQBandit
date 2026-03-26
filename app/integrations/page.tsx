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
import { Badge } from "@/components/ui";
import { AlertCircle, CheckCircle2 } from "lucide-react";
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
import { ProviderAvatar }         from "./ProviderAvatar";
import { getActionsForProvider }  from "@/lib/integrations/toolRouter";
import {
  getMetaOAuthConfig,
  MetaOAuthNotConfiguredError,
} from "@/lib/integrations/providers/metaAdsConfig";
import {
  getGmailOAuthConfig,
  GmailOAuthNotConfiguredError,
} from "@/lib/integrations/providers/gmailConfig";

// ─── badge helpers ────────────────────────────────────────────────────────────

const AUTH_BADGE: Record<AuthType, { bg: string; border: string; color: string; label: string }> = {
  oauth2:  { bg: "rgba(124,58,237,0.1)",  border: "rgba(124,58,237,0.3)",  color: "#7c3aed", label: "OAuth 2.0" },
  api_key: { bg: "rgba(14,165,233,0.1)",  border: "rgba(14,165,233,0.3)",  color: "#0284c7", label: "API key"   },
  none:    { bg: "var(--color-bg-surface-2)", border: "var(--color-border)", color: "var(--color-text-muted)", label: "No auth" },
  webhook: { bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)",  color: "#059669", label: "Webhook"  },
};

const STATUS_BADGE: Record<ProviderStatus, { bg: string; border: string; color: string }> = {
  live:    { bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)",  color: "#059669" },
  beta:    { bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)",  color: "#d97706" },
  planned: { bg: "var(--color-bg-surface-2)", border: "var(--color-border)", color: "var(--color-text-muted)" },
};

const CONN_BADGE: Record<ConnectionStatus | "none", { bg: string; border: string; color: string; label: string }> = {
  connected:    { bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.3)",  color: "#059669", label: "Connected"     },
  expired:      { bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.3)",  color: "#d97706", label: "Expired"       },
  error:        { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.3)",   color: "#dc2626", label: "Error"         },
  disconnected: { bg: "var(--color-bg-surface-2)", border: "var(--color-border)", color: "var(--color-text-muted)", label: "Disconnected"  },
  none:         { bg: "var(--color-bg-surface-2)", border: "var(--color-border)", color: "var(--color-text-muted)", label: "Not connected" },
};

function AuthBadge({ type }: { type: AuthType }) {
  const s = AUTH_BADGE[type];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function StatusBadge({ status }: { status: ProviderStatus }) {
  const s = STATUS_BADGE[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      {status}
    </span>
  );
}

function RWBadge({ supportsRead, supportsWrite }: Pick<IntegrationProvider, "supportsRead" | "supportsWrite">) {
  const parts: string[] = [];
  if (supportsRead)  parts.push("Read");
  if (supportsWrite) parts.push("Write");
  if (parts.length === 0) return null;
  return <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{parts.join(" + ")}</span>;
}

function ConnectionChip({ status }: { status: ConnectionStatus | null }) {
  const key = status ?? "none";
  const s = CONN_BADGE[key] ?? CONN_BADGE.none;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
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
    <div
      className="rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200"
      style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)" }}
    >
      {/* Header: logo + name + status */}
      <div className="flex items-start gap-3">
        <ProviderAvatar id={p.id} name={p.displayName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>{p.displayName}</h3>
            <StatusBadge status={p.status} />
          </div>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--color-text-muted)" }}>{p.description}</p>
        </div>
      </div>

      {/* Meta: auth type · execution mode · R/W */}
      <div className="flex items-center gap-2 flex-wrap">
        <AuthBadge type={p.preferredAuthType} />
        <span className="text-xs" style={{ color: "var(--color-border)" }}>·</span>
        <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>{p.executionMode}</span>
        <span className="text-xs" style={{ color: "var(--color-border)" }}>·</span>
        <RWBadge supportsRead={p.supportsRead} supportsWrite={p.supportsWrite} />
      </div>

      {/* Connection + actions */}
      <div className="pt-3 flex items-center gap-3 flex-wrap" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <ConnectionChip status={connStatus} />
          {connStatus === "expired" && (
            <span className="text-xs text-amber-600">Reconnect to resume</span>
          )}
          {connection?.account_label && (
            <span className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>{connection.account_label}</span>
          )}
          {actionCount > 0 && (
            <span className="text-xs text-emerald-600">
              {actionCount} action{actionCount !== 1 ? "s" : ""} available
            </span>
          )}
        </div>
        <IntegrationCardActions
          providerId={p.id}
          connectionMethod={p.connectionMethod}
          hasConnection={isConnected}
          credentialLabel={p.credentialLabel}
          oauthStartUrl={oauthStartUrl}
        />
      </div>

      {/* Config warning */}
      {configWarning && (
        <div className="rounded-xl px-3 py-2 flex items-start gap-2" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <AlertCircle size={12} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-600">{configWarning}</p>
        </div>
      )}
    </div>
  );
}

// ─── OAuth start URLs ─────────────────────────────────────────────────────────

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

  let connections: ProviderConnection[] = [];
  try {
    connections = listConnections("default");
  } catch {
    // DB unavailable on first run — all providers show "Not connected"
  }
  const connMap = new Map(connections.map((c) => [c.provider_id, c]));

  let metaOAuthConfigured = false;
  let metaConfigWarning: string | undefined;
  try {
    getMetaOAuthConfig();
    metaOAuthConfigured = true;
  } catch (err) {
    if (err instanceof MetaOAuthNotConfiguredError) {
      metaConfigWarning = `Meta OAuth not configured on server (missing ${err.missingKeys.join(", ")}).`;
    }
  }

  let gmailOAuthConfigured = false;
  let gmailConfigWarning: string | undefined;
  try {
    getGmailOAuthConfig();
    gmailOAuthConfigured = true;
  } catch (err) {
    if (err instanceof GmailOAuthNotConfiguredError) {
      gmailConfigWarning = `Gmail OAuth not configured on server (missing ${err.missingKeys.join(", ")}).`;
    }
  }

  const categories     = getCategoriesWithProviders();
  const totalProviders = PROVIDERS.length;
  const connectedCount = connections.filter((c) => c.status === "connected").length;
  const liveCount      = PROVIDERS.filter((p) => p.status === "live").length;
  const betaCount      = PROVIDERS.filter((p) => p.status === "beta").length;
  const plannedCount   = PROVIDERS.filter((p) => p.status === "planned").length;

  const bannerOk  = sp.connected;
  const bannerErr = sp.error;

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg-base)" }}>
      <TopNav activePath="/integrations" email={session.email} />

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* OAuth result banners */}
        {bannerOk && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-2 mb-6" style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)" }}>
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-600">
              Connected to <strong>{bannerOk}</strong> successfully.
            </p>
          </div>
        )}
        {bannerErr && (
          <div className="rounded-2xl px-4 py-3 flex items-center gap-2 mb-6" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600">
              Connection failed: <code className="font-mono text-xs">{bannerErr}</code>
            </p>
          </div>
        )}

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Integrations</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {totalProviders} provider{totalProviders !== 1 ? "s" : ""}
              {connectedCount > 0 && (
                <span className="text-emerald-600 ml-1">· {connectedCount} connected</span>
              )}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {liveCount    > 0 && <Badge variant="success">{liveCount} live</Badge>}
              {betaCount    > 0 && <Badge variant="warning">{betaCount} beta</Badge>}
              {plannedCount > 0 && <Badge variant="muted">{plannedCount} planned</Badge>}
            </div>
          </div>
        </div>

        {/* Category sections */}
        <div className="flex flex-col gap-10">
          {categories.map((category) => {
            const providers = getProvidersByCategory(category);
            return (
              <section key={category}>
                <div className="flex items-baseline gap-2 mb-4">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>{category}</h2>
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {providers.length} provider{providers.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>

        {/* Footer */}
        <div className="mt-10 pt-6" style={{ borderTop: "1px solid var(--color-border)" }}>
          <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-muted)" }}>
            All providers are currently in the planning stage. Connection flows will be
            added progressively. Set INTEGRATIONS_ENCRYPTION_SECRET before storing any tokens.
          </p>
        </div>
      </main>
    </div>
  );
}
