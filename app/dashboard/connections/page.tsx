/**
 * app/dashboard/connections/page.tsx
 * Social media connections — connects X/Twitter BYOK keys and shows capabilities.
 * Server component: loads initial connection status, passes to client form.
 */

import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { getConnectionStatus } from "@/lib/connections";
import { TwitterConnect } from "./TwitterConnect";
import { Card } from "@/components/ui";
import Link from "next/link";

// ─── setup wizard banner ──────────────────────────────────────────────────────

function SetupWizardBanner({
  twitterConnected,
}: {
  twitterConnected: boolean;
}) {
  const steps = [
    { label: "Account created",    done: true  },
    { label: "Connect X/Twitter",  done: twitterConnected },
    { label: "Start posting",      done: false },
  ];
  const completedCount = steps.filter((s) => s.done).length;
  const allDone        = completedCount === steps.length;

  if (allDone) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 flex flex-col gap-4">
        <div>
          <p className="text-lg font-semibold text-emerald-400">🎉 Social Media Agent is ready!</p>
          <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
            Your agent can now post to X on your behalf.
            Head to chat to get started.
          </p>
        </div>
        <Link
          href="/officebuilding"
          className="self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-medium text-white transition-colors"
        >
          💬 Start Chatting →
        </Link>
      </div>
    );
  }

  return (
    <Card className="p-6 flex flex-col gap-5">
      <div>
        <p className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>📱 Setting up Social Media Agent</p>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>
          Connect your social accounts below to activate your Social Media Agent.
        </p>
      </div>

      {/* Progress bar */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Progress</span>
          <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{completedCount} of {steps.length} steps</span>
        </div>
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--color-bg-surface-2)" }}>
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${(completedCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className={`text-sm ${step.done ? "text-emerald-400" : i === completedCount ? "text-amber-400" : ""}`} style={!step.done && i !== completedCount ? { color: "var(--color-text-muted)" } : {}}>
              {step.done ? "✅" : i === completedCount ? "⏳" : "○"}
            </span>
            <span className="text-sm" style={{ color: step.done ? "var(--color-text-secondary)" : i === completedCount ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>
              {step.label}
            </span>
            {!step.done && i === completedCount && (
              <a
                href="#twitter-connect"
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors ml-auto"
              >
                Connect →
              </a>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── capabilities section ──────────────────────────────────────────────────────

function CapabilitiesSection() {
  const capabilities = [
    { icon: "✍️",  text: "Drafts posts tailored for each platform" },
    { icon: "🔍",  text: "Researches topics before writing" },
    { icon: "🧵",  text: "Creates X threads automatically" },
    { icon: "📅",  text: "Schedules posts for optimal timing" },
    { icon: "✅",  text: "Waits for your approval before posting" },
    { icon: "📊",  text: "Tracks what performs well (coming soon)" },
  ];

  const platforms = [
    { icon: "𝕏",  label: "X / Twitter",   available: true  },
    { icon: "📸", label: "Instagram",      available: false },
    { icon: "💼", label: "LinkedIn",       available: false },
    { icon: "🧵", label: "Threads",        available: false },
  ];

  return (
    <Card>
      <div className="px-6 py-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
          📱 Social Media Agent — Capabilities
        </p>
      </div>
      <div className="px-6 py-5 flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {capabilities.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-base">{c.icon}</span>
              <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{c.text}</span>
            </div>
          ))}
        </div>

        <div className="pt-4" style={{ borderTop: "1px solid var(--color-border)" }}>
          <p className="text-xs font-medium mb-3" style={{ color: "var(--color-text-muted)" }}>Currently supported</p>
          <div className="flex flex-wrap gap-2">
            {platforms.map((p) => (
              <div
                key={p.label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs"
                style={p.available
                  ? { background: "var(--color-bg-surface-2)", borderColor: "var(--color-border-hover)", color: "var(--color-text-secondary)" }
                  : { background: "var(--color-bg-surface)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" }}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
                {p.available ? (
                  <span className="text-emerald-400">✓</span>
                ) : (
                  <span style={{ color: "var(--color-text-muted)" }}>coming soon</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const sp     = await searchParams;
  const userId = getCurrentUserIdFromSession(session);

  // Load initial Twitter connection status server-side (no flicker)
  const twitterStatus  = getConnectionStatus(userId, "twitter");
  const showWizard     = sp.setup === "social";

  return (
    <div className="px-8 py-8 max-w-3xl flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>Connections</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          Connect your social accounts to activate posting capabilities.
        </p>
      </div>

      {/* Setup wizard banner — shown when ?setup=social */}
      {showWizard && (
        <SetupWizardBanner twitterConnected={twitterStatus.connected} />
      )}

      {/* X / Twitter connection card */}
      <div id="twitter-connect">
        <TwitterConnect
          initialConnected={twitterStatus.connected}
          initialHandle={twitterStatus.handle}
          initialName={twitterStatus.name}
        />
      </div>

      {/* Capabilities section */}
      <CapabilitiesSection />
    </div>
  );
}
