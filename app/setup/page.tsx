"use client";
/**
 * app/setup/page.tsx
 * First-run onboarding wizard: connect the OpenClaw gateway in 5 steps.
 * Reuses /api/settings (save) and /api/openclaw/test-connection (verify).
 * On finish, calls /api/setup/complete to set the setup cookie and redirects
 * to /officebuilding.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PRESETS, getPreset } from "@/lib/providerPresets";

// ─── types ────────────────────────────────────────────────────────────────────

interface FormState {
  OPENCLAW_GATEWAY_URL: string;
  OPENCLAW_GATEWAY_TOKEN: string;
  OPENCLAW_CHAT_PATH: string;
  STARTCLAW_CHAT_MODE: "openclaw" | "disabled";
  DEFAULT_MODEL: string;
  PROVIDER_PRESET: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

// ─── styles ───────────────────────────────────────────────────────────────────

const WRAP: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#f9f9f7",
  fontFamily: "system-ui, -apple-system, sans-serif",
  padding: 24,
};

const CARD: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e8e8e4",
  borderRadius: 12,
  padding: "40px 44px",
  maxWidth: 500,
  width: "100%",
};

const LABEL: React.CSSProperties = {
  display: "block",
  marginBottom: 5,
  fontSize: 11,
  fontWeight: 700,
  color: "#6b6b60",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "8px 11px",
  fontFamily: "monospace",
  fontSize: 13,
  border: "1px solid #e8e8e4",
  borderRadius: 6,
  background: "#fff",
  boxSizing: "border-box",
  color: "#1a1a17",
  outline: "none",
};

function btn(primary: boolean, disabled = false): React.CSSProperties {
  return {
    padding: "9px 20px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    border: primary ? "none" : "1px solid #e8e8e4",
    background: primary ? (disabled ? "#c8c8c0" : "#1a1a17") : "#fff",
    color: primary ? "#fff" : disabled ? "#b0b0a4" : "#1a1a17",
    opacity: disabled ? 0.7 : 1,
    transition: "background 0.15s",
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function mapTestError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("check your token") || m.includes("401") || m.includes("403")) {
    return "Authentication failed — double-check your gateway token.";
  }
  if (
    m.includes("econnrefused") ||
    m.includes("failed to fetch") ||
    m.includes("unreachable") ||
    m.includes("network")
  ) {
    return "Cannot reach the gateway. Is OpenClaw running at that URL?";
  }
  if (m.includes("timeout") || m.includes("aborted") || m.includes("timed out")) {
    return "Connection timed out. Check the URL and that the gateway port is accessible.";
  }
  if (m.includes("404")) {
    return "Gateway found but endpoint not found (404). Check the URL doesn't include a path prefix.";
  }
  if (m.includes("405")) {
    return "Method not allowed (405). The gateway doesn't support the expected health endpoint.";
  }
  return message;
}

// ─── progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  const STEPS = ["Welcome", "Configure", "Verify", "Model", "Done"];
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {STEPS.map((label, i) => {
          const idx = (i + 1) as Step;
          const active = idx === step;
          const done = idx < step;
          return (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div
                style={{
                  height: 3,
                  borderRadius: 2,
                  background: done ? "#1a1a17" : active ? "#6b6b60" : "#e8e8e4",
                  marginBottom: 5,
                  transition: "background 0.2s",
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active || done ? 700 : 400,
                  color: active ? "#1a1a17" : done ? "#6b6b60" : "#b0b0a4",
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(true);
  const [alreadyHasConfig, setAlreadyHasConfig] = useState(false);

  const [form, setForm] = useState<FormState>({
    OPENCLAW_GATEWAY_URL: "http://127.0.0.1:19001",
    OPENCLAW_GATEWAY_TOKEN: "",
    OPENCLAW_CHAT_PATH: "/v1/chat/completions",
    STARTCLAW_CHAT_MODE: "openclaw",
    DEFAULT_MODEL: "openclaw:main",
    PROVIDER_PRESET: "openclaw",
  });

  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  // ── mark setup done and go to app ─────────────────────────────────────────
  const completeSetup = useCallback(async () => {
    setFinishing(true);
    try {
      await fetch("/api/setup/complete", { method: "POST" });
    } catch {
      // best-effort — proceed regardless
    }
    router.replace("/officebuilding");
  }, [router]);

  // ── on mount: check status + pre-fill form ────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [statusRes, settingsRes] = await Promise.all([
          fetch("/api/setup/status"),
          fetch("/api/settings"),
        ]);
        const [status, settings] = await Promise.all([
          statusRes.json() as Promise<{ configured: boolean; hasConfig: boolean }>,
          settingsRes.json(),
        ]);

        if (cancelled) return;

        // Pre-fill form with stored values (token shown as masked placeholder if set)
        if (settings && !settings.error) {
          setForm((prev) => ({
            ...prev,
            OPENCLAW_GATEWAY_URL: settings.OPENCLAW_GATEWAY_URL || prev.OPENCLAW_GATEWAY_URL,
            OPENCLAW_CHAT_PATH: settings.OPENCLAW_CHAT_PATH || prev.OPENCLAW_CHAT_PATH,
            STARTCLAW_CHAT_MODE: settings.STARTCLAW_CHAT_MODE || prev.STARTCLAW_CHAT_MODE,
            DEFAULT_MODEL: settings.DEFAULT_MODEL || prev.DEFAULT_MODEL,
            OPENCLAW_GATEWAY_TOKEN: settings.OPENCLAW_GATEWAY_TOKEN || prev.OPENCLAW_GATEWAY_TOKEN,
            PROVIDER_PRESET: settings.PROVIDER_PRESET ?? prev.PROVIDER_PRESET,
          }));
        }

        // Already fully done — set cookie and redirect silently
        if (status.configured) {
          await fetch("/api/setup/complete", { method: "POST" });
          if (!cancelled) router.replace("/officebuilding");
          return;
        }

        if (!cancelled) {
          setAlreadyHasConfig(status.hasConfig);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // ── form helpers ──────────────────────────────────────────────────────────
  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** Apply a provider preset: sync URL (if preset has one) + chat path. */
  const applyPreset = (id: string) => {
    const p = getPreset(id);
    setForm((prev) => ({
      ...prev,
      PROVIDER_PRESET: id,
      ...(p
        ? {
            ...(p.urlDefault ? { OPENCLAW_GATEWAY_URL: p.urlDefault } : {}),
            OPENCLAW_CHAT_PATH: p.chatPath,
            DEFAULT_MODEL: prev.DEFAULT_MODEL || p.defaultModel,
          }
        : {}),
    }));
    setTestResult(null);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/openclaw/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: form.OPENCLAW_GATEWAY_URL,
          // Send token only if the user typed a real value (not the API's masked placeholder)
          token:
            form.OPENCLAW_GATEWAY_TOKEN === "***configured***"
              ? undefined
              : form.OPENCLAW_GATEWAY_TOKEN || undefined,
        }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setTestResult({
        ok: data.ok,
        message: data.ok ? data.message : mapTestError(data.message),
      });
    } catch {
      setTestResult({ ok: false, message: "Network error — could not reach the test endpoint." });
    } finally {
      setTesting(false);
    }
  };

  // Save gateway settings (URL, token, path, mode) — called after test passes
  const saveGatewaySettings = async (): Promise<boolean> => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          OPENCLAW_GATEWAY_URL: form.OPENCLAW_GATEWAY_URL,
          OPENCLAW_GATEWAY_TOKEN:
            form.OPENCLAW_GATEWAY_TOKEN === "***configured***"
              ? undefined
              : form.OPENCLAW_GATEWAY_TOKEN,
          OPENCLAW_CHAT_PATH: form.OPENCLAW_CHAT_PATH,
          STARTCLAW_CHAT_MODE: form.STARTCLAW_CHAT_MODE,
          PROVIDER_PRESET: form.PROVIDER_PRESET,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({ error: "Save failed" }))) as {
          error?: string;
          details?: string[];
        };
        setSaveError(
          err.details ? err.details.join("; ") : err.error ?? "Save failed"
        );
        return false;
      }
      return true;
    } catch {
      setSaveError("Network error — settings not saved.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Save default model and advance to Step 5
  const saveModelAndContinue = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ DEFAULT_MODEL: form.DEFAULT_MODEL }),
      });
    } catch {
      // best-effort — always advance
    } finally {
      setSaving(false);
    }
    setStep(5);
  };

  // ── loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={WRAP}>
        <div style={{ color: "#6b6b60", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
          Checking setup status…
        </div>
      </div>
    );
  }

  // ── wizard ────────────────────────────────────────────────────────────────
  return (
    <div style={WRAP}>
      <div style={CARD}>
        {/* Logo */}
        <div
          style={{
            marginBottom: 28,
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: "0.04em",
            color: "#1a1a17",
          }}
        >
          IQ BANDIT
        </div>

        <ProgressBar step={step} />

        {/* ── Step 1: Welcome ────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 10, color: "#1a1a17", margin: "0 0 10px" }}>
              Set up IQ BANDIT
            </h1>
            <p style={{ fontSize: 14, color: "#6b6b60", lineHeight: 1.65, margin: "0 0 28px" }}>
              Connect your AI gateway in a few quick steps. Choose a provider
              preset or configure manually — you&apos;ll need your gateway URL
              and API key (if required).
            </p>

            {alreadyHasConfig && (
              <div
                style={{
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: 8,
                  padding: "12px 16px",
                  marginBottom: 24,
                  fontSize: 13,
                  color: "#92400e",
                  lineHeight: 1.5,
                }}
              >
                <strong>Gateway settings detected.</strong> You can skip ahead to verify the
                connection, or reconfigure from scratch below.
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={btn(true)} onClick={() => setStep(2)}>
                Get Started →
              </button>
              {alreadyHasConfig && (
                <button style={btn(false)} onClick={() => setStep(3)}>
                  Skip to verification →
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Gateway Config ──────────────────────────────────── */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: "#1a1a17", margin: "0 0 6px" }}>
              Configure gateway
            </h1>
            <p style={{ fontSize: 13, color: "#6b6b60", margin: "0 0 24px" }}>
              Choose a provider preset to prefill defaults, then enter your
              gateway URL and credentials. Saved to SQLite — change anytime in
              Settings → Integrations.
            </p>

            {/* Provider preset */}
            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>Provider</label>
              <select
                value={form.PROVIDER_PRESET}
                onChange={(e) => applyPreset(e.target.value)}
                style={{ ...INPUT, width: "auto", cursor: "pointer" }}
              >
                <option value="">— Custom —</option>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>Gateway URL</label>
              <input
                type="url"
                value={form.OPENCLAW_GATEWAY_URL}
                onChange={(e) => { set("OPENCLAW_GATEWAY_URL", e.target.value); setTestResult(null); }}
                style={INPUT}
                placeholder={getPreset(form.PROVIDER_PRESET)?.urlPlaceholder ?? "http://127.0.0.1:19001"}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              {(() => {
                const p = getPreset(form.PROVIDER_PRESET);
                const label = p ? p.tokenLabel : "Gateway Token";
                const required = p ? p.tokenRequired : true;
                return (
                  <>
                    <label style={LABEL}>
                      {label}{" "}
                      <span style={{ fontWeight: 400, textTransform: "none" as const, letterSpacing: 0 }}>
                        {required ? "(leave blank to keep current)" : "(optional)"}
                      </span>
                    </label>
                    <input
                      type="password"
                      value={form.OPENCLAW_GATEWAY_TOKEN}
                      onChange={(e) => set("OPENCLAW_GATEWAY_TOKEN", e.target.value)}
                      style={INPUT}
                      placeholder={required ? "leave blank to keep current" : "leave blank for no authentication"}
                      autoComplete="new-password"
                    />
                    {p && (
                      <p style={{ marginTop: 5, fontSize: 12, color: "#6b6b60", lineHeight: 1.5 }}>
                        {p.helpText}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>Chat Path</label>
              <input
                type="text"
                value={form.OPENCLAW_CHAT_PATH}
                onChange={(e) => set("OPENCLAW_CHAT_PATH", e.target.value)}
                style={INPUT}
                placeholder="/v1/chat/completions"
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={LABEL}>Chat Mode</label>
              <select
                value={form.STARTCLAW_CHAT_MODE}
                onChange={(e) => set("STARTCLAW_CHAT_MODE", e.target.value)}
                style={{ ...INPUT, width: "auto", cursor: "pointer" }}
              >
                <option value="openclaw">openclaw — enabled</option>
                <option value="disabled">disabled</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn(false)} onClick={() => setStep(1)}>
                ← Back
              </button>
              <button
                style={btn(true, !form.OPENCLAW_GATEWAY_URL)}
                disabled={!form.OPENCLAW_GATEWAY_URL}
                onClick={() => {
                  setTestResult(null); // reset test when config changes
                  setStep(3);
                }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Test Connection ─────────────────────────────────── */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a17", margin: "0 0 6px" }}>
              Verify connection
            </h1>
            <p style={{ fontSize: 13, color: "#6b6b60", margin: "0 0 24px" }}>
              Test that IQ BANDIT can reach your gateway. The connection must succeed before
              continuing.
            </p>

            {/* Summary */}
            <div
              style={{
                background: "#f9f9f7",
                border: "1px solid #e8e8e4",
                borderRadius: 8,
                padding: "12px 16px",
                marginBottom: 20,
                fontSize: 12,
                fontFamily: "monospace",
              }}
            >
              <div style={{ color: "#6b6b60", marginBottom: 3 }}>Gateway URL</div>
              <div style={{ color: "#1a1a17", wordBreak: "break-all", marginBottom: 10 }}>
                {form.OPENCLAW_GATEWAY_URL || "(not set)"}
              </div>
              <div style={{ color: "#6b6b60", marginBottom: 3 }}>Token</div>
              <div style={{ color: "#1a1a17" }}>
                {form.OPENCLAW_GATEWAY_TOKEN
                  ? form.OPENCLAW_GATEWAY_TOKEN === "***configured***"
                    ? "●●● (configured)"
                    : "●●● (entered)"
                  : "(not set)"}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <button style={btn(false, testing)} disabled={testing} onClick={testConnection}>
                {testing ? "Testing…" : "Test Connection"}
              </button>
            </div>

            {testResult && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  background: testResult.ok ? "#f0fdf4" : "#fef2f2",
                  color: testResult.ok ? "#166534" : "#991b1b",
                  border: `1px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}`,
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                {testResult.ok ? "✓ " : "✗ "}
                {testResult.message}
              </div>
            )}

            {saveError && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  marginBottom: 16,
                }}
              >
                {saveError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn(false)} onClick={() => setStep(2)}>
                ← Back
              </button>
              <button
                style={btn(true, !testResult?.ok || saving)}
                disabled={!testResult?.ok || saving}
                onClick={async () => {
                  const ok = await saveGatewaySettings();
                  if (ok) setStep(4);
                }}
              >
                {saving ? "Saving…" : "Continue →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Default Model ───────────────────────────────────── */}
        {step === 4 && (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a17", margin: "0 0 6px" }}>
              Default model
            </h1>
            <p style={{ fontSize: 13, color: "#6b6b60", margin: "0 0 24px" }}>
              Set the model IQ BANDIT will use for chats. You can change this later in Settings.
            </p>

            <div style={{ marginBottom: 8 }}>
              <label style={LABEL}>Model name</label>
              <input
                type="text"
                value={form.DEFAULT_MODEL}
                onChange={(e) => set("DEFAULT_MODEL", e.target.value)}
                style={INPUT}
                placeholder="openclaw:main"
              />
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 24px" }}>
              Use the model identifier from your gateway, e.g.{" "}
              <code style={{ fontFamily: "monospace" }}>openclaw:main</code>
            </p>

            {saveError && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  marginBottom: 16,
                }}
              >
                {saveError}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn(false)} onClick={() => setStep(3)}>
                ← Back
              </button>
              <button
                style={btn(true, saving || !form.DEFAULT_MODEL.trim())}
                disabled={saving || !form.DEFAULT_MODEL.trim()}
                onClick={saveModelAndContinue}
              >
                {saving ? "Saving…" : "Continue →"}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Done ────────────────────────────────────────────── */}
        {step === 5 && (
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a17", margin: "0 0 10px" }}>
              You&apos;re all set!
            </h1>
            <p style={{ fontSize: 14, color: "#6b6b60", lineHeight: 1.65, margin: "0 0 28px" }}>
              IQ BANDIT is connected to your gateway and ready to go.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 36 }}>
              {[
                "Gateway configured",
                "Connection verified",
                `Default model: ${form.DEFAULT_MODEL || "openclaw:main"}`,
              ].map((item) => (
                <div
                  key={item}
                  style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#dcfce7",
                      color: "#166534",
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    ✓
                  </span>
                  <span style={{ color: "#1a1a17" }}>{item}</span>
                </div>
              ))}
            </div>

            <button style={btn(true, finishing)} disabled={finishing} onClick={completeSetup}>
              {finishing ? "Opening IQ BANDIT…" : "Go to IQ BANDIT →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
