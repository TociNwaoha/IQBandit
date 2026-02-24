/**
 * app/settings/page.tsx
 * System settings — gateway health, chat mode, admin account.
 * Gateway status UI moved here from the old dashboard.
 */

import { getSessionFromCookies } from "@/lib/auth";
import { checkGatewayHealth, type GatewayHealthResponse } from "@/lib/openclaw";
import { getChatMode } from "@/lib/llm";
import { getSettings } from "@/lib/settings";
import { TopNav } from "@/components/TopNav";
import { redirect } from "next/navigation";

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SettingsPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  let health: GatewayHealthResponse;
  try {
    health = await checkGatewayHealth();
  } catch {
    health = { status: "down", message: "Could not reach gateway" };
  }

  const settings = getSettings();
  const chatMode = getChatMode();

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
            System configuration and gateway health.
          </p>
        </div>

        <div className="flex flex-col gap-5">
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
