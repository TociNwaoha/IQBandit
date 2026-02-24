"use client";
/**
 * app/settings/integrations/page.tsx
 * Backend config UI — no server component wrapper needed because
 * /settings is already protected by the edge middleware in proxy.ts.
 */

import { useState, useEffect } from "react";

interface Settings {
  OPENCLAW_GATEWAY_URL: string;
  OPENCLAW_GATEWAY_TOKEN: string;
  OPENCLAW_CHAT_PATH: string;
  STARTCLAW_CHAT_MODE: "openclaw" | "disabled";
  DEFAULT_MODEL: string;
}

const EMPTY: Settings = {
  OPENCLAW_GATEWAY_URL: "",
  OPENCLAW_GATEWAY_TOKEN: "",
  OPENCLAW_CHAT_PATH: "",
  STARTCLAW_CHAT_MODE: "openclaw",
  DEFAULT_MODEL: "",
};

const ROW: React.CSSProperties = { marginBottom: 14 };
const LABEL: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "#6b6b60",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const INPUT: React.CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontFamily: "monospace",
  fontSize: 13,
  border: "1px solid #e8e8e4",
  borderRadius: 6,
  background: "#fff",
  boxSizing: "border-box",
  color: "#1a1a17",
};
const BTN = (primary: boolean): React.CSSProperties => ({
  padding: "8px 18px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 6,
  cursor: "pointer",
  border: primary ? "none" : "1px solid #e8e8e4",
  background: primary ? "#1a1a17" : "#fff",
  color: primary ? "#fff" : "#1a1a17",
});

export default function IntegrationsPage() {
  const [form, setForm] = useState<Settings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: Settings) => { setForm(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const set = (key: keyof Settings, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setSaveMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: "Save failed." });
    } catch {
      setSaveMsg({ ok: false, text: "Save failed — network error." });
    } finally {
      setSaving(false);
    }
  };

  const testConn = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/openclaw/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: form.OPENCLAW_GATEWAY_URL,
          // Send token only if user typed a real value (not the masked placeholder)
          token: form.OPENCLAW_GATEWAY_TOKEN === "***configured***" ? undefined : form.OPENCLAW_GATEWAY_TOKEN,
        }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      setTestResult(data);
    } catch {
      setTestResult({ ok: false, message: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <main style={{ padding: 24, fontFamily: "monospace", fontSize: 13 }}>Loading…</main>;
  }

  return (
    <main style={{ padding: 24, maxWidth: 580, fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
      <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Backend Integrations</h1>
      <p style={{ fontSize: 12, color: "#6b6b60", marginBottom: 24 }}>
        Settings persist in SQLite and override .env.local. Takes effect on the next request.
      </p>

      {/* Chat mode */}
      <div style={ROW}>
        <label style={LABEL}>Chat Mode</label>
        <select
          value={form.STARTCLAW_CHAT_MODE}
          onChange={(e) => set("STARTCLAW_CHAT_MODE", e.target.value)}
          style={{ ...INPUT, width: "auto" }}
        >
          <option value="openclaw">openclaw — enabled</option>
          <option value="disabled">disabled</option>
        </select>
      </div>

      {/* Gateway URL */}
      <div style={ROW}>
        <label style={LABEL}>Gateway URL</label>
        <input
          type="text"
          value={form.OPENCLAW_GATEWAY_URL}
          onChange={(e) => set("OPENCLAW_GATEWAY_URL", e.target.value)}
          style={INPUT}
          placeholder="http://127.0.0.1:19001"
        />
      </div>

      {/* Chat path */}
      <div style={ROW}>
        <label style={LABEL}>Chat Path</label>
        <input
          type="text"
          value={form.OPENCLAW_CHAT_PATH}
          onChange={(e) => set("OPENCLAW_CHAT_PATH", e.target.value)}
          style={INPUT}
          placeholder="/v1/chat/completions"
        />
      </div>

      {/* Default model */}
      <div style={ROW}>
        <label style={LABEL}>Default Model</label>
        <input
          type="text"
          value={form.DEFAULT_MODEL}
          onChange={(e) => set("DEFAULT_MODEL", e.target.value)}
          style={INPUT}
          placeholder="openclaw:main"
        />
      </div>

      {/* Token — password field, shows mask if already set */}
      <div style={ROW}>
        <label style={LABEL}>
          Gateway Token{" "}
          <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            (leave blank to keep current)
          </span>
        </label>
        <input
          type="password"
          value={form.OPENCLAW_GATEWAY_TOKEN}
          onChange={(e) => set("OPENCLAW_GATEWAY_TOKEN", e.target.value)}
          style={INPUT}
          placeholder="leave blank to keep current"
          autoComplete="new-password"
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 20 }}>
        <button onClick={save} disabled={saving} style={BTN(true)}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={testConn} disabled={testing} style={BTN(false)}>
          {testing ? "Testing…" : "Test Connection"}
        </button>
        {saveMsg && (
          <span style={{ fontSize: 13, color: saveMsg.ok ? "#166534" : "#991b1b" }}>
            {saveMsg.text}
          </span>
        )}
      </div>

      {testResult && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13,
            fontFamily: "monospace",
            background: testResult.ok ? "#f0fdf4" : "#fef2f2",
            color: testResult.ok ? "#166534" : "#991b1b",
            border: `1px solid ${testResult.ok ? "#bbf7d0" : "#fecaca"}`,
          }}
        >
          {testResult.ok ? "✓ " : "✗ "}
          {testResult.message}
        </div>
      )}
    </main>
  );
}
