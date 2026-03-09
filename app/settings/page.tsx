/**
 * app/settings/page.tsx
 * System settings — gateway health, chat mode, admin account, integrations.
 */

import { getSessionFromCookies } from "@/lib/auth";
import { checkGatewayHealth, type GatewayHealthResponse } from "@/lib/openclaw";
import { getChatMode } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { TopNav } from "@/components/TopNav";
import { redirect } from "next/navigation";
import {
  listConnections,
  type ProviderConnection,
  type ConnectionStatus,
} from "@/lib/integrations/connections";
import { PROVIDERS } from "@/lib/integrations/providerRegistry";
import {
  getGmailOAuthConfig,
  GmailOAuthNotConfiguredError,
} from "@/lib/integrations/providers/gmailConfig";
import {
  getMetaOAuthConfig,
  MetaOAuthNotConfiguredError,
} from "@/lib/integrations/providers/metaAdsConfig";
import { IntegrationCardActions } from "../integrations/IntegrationCardActions";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ status }: { status: GatewayHealthResponse["status"] }) {
  const colors = {
    ok: "bg-emerald-500",
    degraded: "bg-amber-500",
    down: "bg-red-500",
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colors[status]}`}
    />
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function SettingsRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span
        className={`text-sm text-gray-900 ${mono ? "font-mono text-xs" : "font-medium"}`}
      >
        {value}
      </span>
    </div>
  );
}

function ConnectionBadge({ status }: { status: ConnectionStatus | null }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
        Connected
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100">
        Expired
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-100">
        Error
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
      Not connected
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const OAUTH_START_URLS: Record<string, string> = {
  notion:   "/api/integrations/oauth/notion/start",
  meta_ads: "/api/integrations/oauth/meta/start",
  gmail:    "/api/integrations/oauth/gmail/start",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const sp = await searchParams;

  let health: GatewayHealthResponse;
  try {
    health = await checkGatewayHealth();
  } catch {
    health = { status: "down", message: "Could not reach gateway" };
  }

  const settings = getSettings();
  const chatMode = getChatMode();

  // ── integrations data ─────────────────────────────────────────────────────

  let connections: ProviderConnection[] = [];
  try {
    connections = listConnections("default");
  } catch {
    // DB unavailable on first run
  }
  const connMap = new Map(connections.map((c) => [c.provider_id, c]));

  let gmailOAuthConfigured = false;
  let gmailConfigWarning: string | undefined;
  try {
    getGmailOAuthConfig();
    gmailOAuthConfigured = true;
  } catch (err) {
    if (err instanceof GmailOAuthNotConfiguredError) {
      gmailConfigWarning = `Gmail OAuth not configured (missing ${err.missingKeys.join(", ")})`;
    }
  }

  let metaOAuthConfigured = false;
  let metaConfigWarning: string | undefined;
  try {
    getMetaOAuthConfig();
    metaOAuthConfigured = true;
  } catch (err) {
    if (err instanceof MetaOAuthNotConfiguredError) {
      metaConfigWarning = `Meta Ads OAuth not configured (missing ${err.missingKeys.join(", ")})`;
    }
  }

  // Show only providers with a live adapter
  const liveProviders = PROVIDERS.filter(
    (p) => p.implementationStatus === "adapter_live",
  );

  const configWarnings: Record<string, string | undefined> = {
    gmail:    gmailConfigWarning,
    meta_ads: metaConfigWarning,
  };

  const oauthStartUrls: Record<string, string | undefined> = {
    gmail:    gmailOAuthConfigured ? OAUTH_START_URLS.gmail : undefined,
    meta_ads: metaOAuthConfigured  ? OAUTH_START_URLS.meta_ads : undefined,
    notion:   OAUTH_START_URLS.notion,
  };

  // ─────────────────────────────────────────────────────────────────────────

  const statusLabels: Record<GatewayHealthResponse["status"], string> = {
    ok: "Operational",
    degraded: "Degraded",
    down: "Down",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav activePath="/settings" email={session.email} />

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            System configuration, integrations, and gateway health.
          </p>
        </div>

        {/* OAuth result banners */}
        {sp.connected && (
          <div className="mb-5 flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4">
            <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-medium text-emerald-800">
              Connected to <span className="capitalize">{sp.connected}</span> successfully.
            </p>
          </div>
        )}
        {sp.error && (
          <div className="mb-5 flex items-start gap-3 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
            <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-800">Connection failed</p>
              <p className="text-xs text-red-600 mt-0.5 font-mono">{sp.error}</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-5">

          {/* Integrations */}
          <SectionCard title="Integrations">
            {liveProviders.map((p, i) => {
              const conn = connMap.get(p.id);
              const isConnected = conn?.status === "connected";
              const warning = configWarnings[p.id];
              const oauthUrl = oauthStartUrls[p.id];
              return (
                <div
                  key={p.id}
                  className={`flex items-start justify-between py-3 gap-4 ${
                    i < liveProviders.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">
                        {p.displayName}
                      </span>
                      <ConnectionBadge status={conn?.status ?? null} />
                    </div>
                    {conn?.account_label && (
                      <p className="text-xs text-gray-400 mt-0.5">{conn.account_label}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                      {p.description}
                    </p>
                    {warning && (
                      <p className="text-xs text-amber-600 mt-1">{warning}</p>
                    )}
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <IntegrationCardActions
                      providerId={p.id}
                      connectionMethod={p.connectionMethod}
                      hasConnection={isConnected}
                      credentialLabel={p.credentialLabel}
                      oauthStartUrl={oauthUrl}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-gray-400 pt-3 border-t border-gray-50 mt-1">
              <a href="/integrations" className="text-violet-600 hover:underline">
                View all integrations →
              </a>
            </p>
          </SectionCard>

          {/* Gateway health + active configuration */}
          <SectionCard title="Gateway">
            <SettingsRow
              label="Status"
              value={
                <span className="flex items-center gap-2">
                  <StatusDot status={health.status} />
                  {statusLabels[health.status]}
                </span>
              }
            />
            <SettingsRow
              label="Endpoint"
              value={settings.OPENCLAW_GATEWAY_URL || "(not set)"}
              mono
            />
            <SettingsRow
              label="Chat path"
              value={settings.OPENCLAW_CHAT_PATH || "(not set)"}
              mono
            />
            <SettingsRow
              label="Default model"
              value={settings.DEFAULT_MODEL || "(not set)"}
              mono
            />
            {health.uptime !== undefined && (
              <SettingsRow
                label="Uptime"
                value={`${health.uptime}s`}
              />
            )}
            {health.message && (
              <SettingsRow label="Message" value={health.message} />
            )}
            <SettingsRow
              label="Chat mode"
              value={
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full border ${
                    chatMode === "openclaw"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : "bg-amber-50 text-amber-700 border-amber-100"
                  }`}
                >
                  {chatMode === "openclaw" ? "Active" : "Disabled"}
                  <span className="font-mono normal-case font-normal">
                    ({chatMode})
                  </span>
                </span>
              }
            />
          </SectionCard>

          {/* Chat mode hint */}
          {chatMode === "disabled" && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
              <svg
                className="w-4 h-4 text-amber-500 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Playground is in read-only mode
                </p>
                <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
                  Set{" "}
                  <code className="font-mono bg-amber-100 rounded px-1">
                    STARTCLAW_CHAT_MODE=openclaw
                  </code>{" "}
                  in your <code className="font-mono bg-amber-100 rounded px-1">.env.local</code>{" "}
                  once the REST endpoint is ready.
                </p>
              </div>
            </div>
          )}

          {/* Admin account */}
          <SectionCard title="Admin account">
            <SettingsRow label="Email" value={session.email} />
            <SettingsRow
              label="Auth method"
              value="Environment variables"
            />
            <SettingsRow
              label="Multi-user auth"
              value={
                <span className="text-xs text-gray-400 italic">
                  Coming soon
                </span>
              }
            />
          </SectionCard>

          {/* Instance */}
          <SectionCard title="Instance">
            <SettingsRow label="Version" value="0.1.0-mvp" />
            <SettingsRow
              label="Environment"
              value={process.env.NODE_ENV ?? "development"}
            />
          </SectionCard>
        </div>
      </main>
    </div>
  );
}
