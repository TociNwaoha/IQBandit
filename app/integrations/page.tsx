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
import { getActionsForProvider }  from "@/lib/integrations/toolRouter";
import {
  getMetaOAuthConfig,
  MetaOAuthNotConfiguredError,
} from "@/lib/integrations/providers/metaAdsConfig";
import {
  getGmailOAuthConfig,
  GmailOAuthNotConfiguredError,
} from "@/lib/integrations/providers/gmailConfig";

// ─── provider logo map ────────────────────────────────────────────────────────
// Maps provider IDs → Simple Icons slugs (cdn.simpleicons.org/{slug})
// null = no icon available; falls back to initials avatar

const PROVIDER_ICONS: Record<string, string | null> = {
  gmail:            "gmail",
  outlook_mail:     "microsoftoutlook",
  slack:            "slack",
  discord:          "discord",
  microsoft_teams:  "microsoftteams",
  notion:           "notion",
  google_drive:     "googledrive",
  google_sheets:    "googlesheets",
  airtable:         "airtable",
  confluence:       "confluence",
  google_calendar:  "googlecalendar",
  outlook_calendar: "microsoftoutlook",
  calendly:         "calendly",
  meta_ads:         "meta",
  tiktok_ads:       "tiktok",
  google_ads:       "googleads",
  linkedin_ads:     "linkedin",
  klaviyo:          "klaviyo",
  mailchimp:        "mailchimp",
  hubspot:          "hubspot",
  salesforce:       "salesforce",
  pipedrive:        "pipedrive",
  shopify:          "shopify",
  stripe:           "stripe",
  woocommerce:      "woocommerce",
  paypal:           "paypal",
  zendesk:          "zendesk",
  intercom:         "intercom",
  freshdesk:        "freshdesk",
  helpscout:        "helpscout",
  asana:            "asana",
  clickup:          "clickup",
  trello:           "trello",
  jira:             "jira",
  generic_rest_api: null,
  webhook:          null,
};

function ProviderAvatar({ id, name }: { id: string; name: string }) {
  const slug     = PROVIDER_ICONS[id] ?? null;
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
      {slug ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://cdn.simpleicons.org/${slug}`}
          alt={name}
          width={22}
          height={22}
          className="object-contain"
        />
      ) : (
        <span className="text-xs font-bold text-gray-500">{initials}</span>
      )}
    </div>
  );
}

// ─── badge helpers ────────────────────────────────────────────────────────────

const AUTH_CLASSES: Record<AuthType, string> = {
  oauth2:  "bg-violet-50 border-violet-200 text-violet-700",
  api_key: "bg-sky-50 border-sky-200 text-sky-700",
  none:    "bg-gray-100 border-gray-200 text-gray-500",
  webhook: "bg-emerald-50 border-emerald-200 text-emerald-700",
};

const AUTH_LABELS: Record<AuthType, string> = {
  oauth2:  "OAuth 2.0",
  api_key: "API key",
  none:    "No auth",
  webhook: "Webhook",
};

const STATUS_CLASSES: Record<ProviderStatus, string> = {
  planned: "bg-gray-100 border-gray-200 text-gray-500",
  beta:    "bg-amber-50 border-amber-200 text-amber-700",
  live:    "bg-emerald-50 border-emerald-200 text-emerald-700",
};

const CONN_MAP: Record<ConnectionStatus | "none", { cls: string; label: string }> = {
  connected:    { cls: "bg-emerald-50 border-emerald-200 text-emerald-700", label: "Connected"     },
  expired:      { cls: "bg-amber-50 border-amber-200 text-amber-700",       label: "Expired"       },
  error:        { cls: "bg-red-50 border-red-200 text-red-700",             label: "Error"         },
  disconnected: { cls: "bg-gray-100 border-gray-200 text-gray-500",         label: "Disconnected"  },
  none:         { cls: "bg-gray-100 border-gray-200 text-gray-400",         label: "Not connected" },
};

function AuthBadge({ type }: { type: AuthType }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${AUTH_CLASSES[type]}`}>
      {AUTH_LABELS[type]}
    </span>
  );
}

function StatusBadge({ status }: { status: ProviderStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium capitalize ${STATUS_CLASSES[status]}`}>
      {status}
    </span>
  );
}

function RWBadge({ supportsRead, supportsWrite }: Pick<IntegrationProvider, "supportsRead" | "supportsWrite">) {
  const parts: string[] = [];
  if (supportsRead)  parts.push("Read");
  if (supportsWrite) parts.push("Write");
  if (parts.length === 0) return null;
  return <span className="text-xs text-gray-400">{parts.join(" + ")}</span>;
}

function ConnectionChip({ status }: { status: ConnectionStatus | null }) {
  const key = status ?? "none";
  const { cls, label } = CONN_MAP[key] ?? CONN_MAP.none;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${cls}`}>
      {label}
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
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4 hover:border-gray-300 hover:shadow-sm transition-all duration-200">
      {/* Header: logo + name + status */}
      <div className="flex items-start gap-3">
        <ProviderAvatar id={p.id} name={p.displayName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">{p.displayName}</h3>
            <StatusBadge status={p.status} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{p.description}</p>
        </div>
      </div>

      {/* Meta: auth type · execution mode · R/W */}
      <div className="flex items-center gap-2 flex-wrap">
        <AuthBadge type={p.preferredAuthType} />
        <span className="text-gray-300 text-xs">·</span>
        <span className="text-xs text-gray-400">{p.executionMode}</span>
        <span className="text-gray-300 text-xs">·</span>
        <RWBadge supportsRead={p.supportsRead} supportsWrite={p.supportsWrite} />
      </div>

      {/* Connection + actions */}
      <div className="border-t border-gray-100 pt-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <ConnectionChip status={connStatus} />
          {connStatus === "expired" && (
            <span className="text-xs text-amber-600">Reconnect to resume</span>
          )}
          {connection?.account_label && (
            <span className="text-xs text-gray-400 truncate">{connection.account_label}</span>
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
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
          <AlertCircle size={12} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">{configWarning}</p>
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
    <div className="min-h-screen bg-gray-50">
      <TopNav activePath="/integrations" email={session.email} />

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* OAuth result banners */}
        {bannerOk && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-center gap-2 mb-6">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700">
              Connected to <strong>{bannerOk}</strong> successfully.
            </p>
          </div>
        )}
        {bannerErr && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2 mb-6">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-700">
              Connection failed: <code className="font-mono text-xs">{bannerErr}</code>
            </p>
          </div>
        )}

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Integrations</h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <p className="text-sm text-gray-500">
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
                  <h2 className="text-sm font-semibold text-gray-700">{category}</h2>
                  <span className="text-xs text-gray-400">
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
        <div className="mt-10 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-400 leading-relaxed">
            All providers are currently in the planning stage. Connection flows will be
            added progressively. Set INTEGRATIONS_ENCRYPTION_SECRET before storing any tokens.
          </p>
        </div>
      </main>
    </div>
  );
}
