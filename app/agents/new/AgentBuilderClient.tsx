"use client";

/**
 * app/agents/new/AgentBuilderClient.tsx
 * Agent Builder — multi-section form that mirrors the OpenClaw workspace
 * file structure (IDENTITY.md, SOUL.md, TOOLS/skills, AGENTS.md rules).
 *
 * Sections:
 *   1. Identity  — name, emoji, department, vibe
 *   2. Soul      — core values, communication style, expertise
 *   3. Skills    — tool access (Gmail, web, files) + response style
 *   4. Rules     — behavioral rules, off-limits
 *   5. Preview   — live composed system prompt (read-only)
 */

import { useState, useMemo }  from "react";
import { useRouter }           from "next/navigation";
import type { Department }     from "@/lib/departments";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  departments: Department[];
}

type ResponseStyle = "brief" | "balanced" | "detailed";

// ─── Compose system prompt from all sections ──────────────────────────────────

function composeSystemPrompt(fields: {
  name:         string;
  emoji:        string;
  vibe:         string;
  soulValues:   string;
  commStyle:    string;
  expertise:    string;
  rules:        string;
  neverDo:      string;
}): string {
  const parts: string[] = [];

  const header = `# ${fields.name.trim()}${fields.emoji.trim() ? " " + fields.emoji.trim() : ""}`;
  parts.push(header);

  if (fields.vibe.trim())       parts.push(fields.vibe.trim());
  if (fields.soulValues.trim()) parts.push(`## Soul & Values\n${fields.soulValues.trim()}`);
  if (fields.commStyle.trim())  parts.push(`## Communication Style\n${fields.commStyle.trim()}`);
  if (fields.expertise.trim())  parts.push(`## Expertise & Focus\n${fields.expertise.trim()}`);
  if (fields.rules.trim())      parts.push(`## Rules\n${fields.rules.trim()}`);
  if (fields.neverDo.trim())    parts.push(`## Off-Limits\n${fields.neverDo.trim()}`);

  return parts.join("\n\n");
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  file,
  title,
  subtitle,
  children,
}: {
  file:     string;
  title:    string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-baseline gap-3">
        <span className="text-xs font-mono text-violet-500 bg-violet-50 border border-violet-100 rounded px-1.5 py-0.5 shrink-0">
          {file}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="px-6 py-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label:    string;
  hint?:    string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-700">{label}</label>
      {hint && <p className="text-xs text-gray-400 -mt-0.5">{hint}</p>}
      {children}
    </div>
  );
}

const inputCls =
  "w-full text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 placeholder:text-gray-400";

const textareaCls =
  "w-full text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 placeholder:text-gray-400 resize-none leading-relaxed";

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked:     boolean;
  onChange:    (v: boolean) => void;
  label:       string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-300 ${
          checked ? "bg-violet-600" : "bg-gray-200"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
      <div>
        <span className="text-sm font-medium text-gray-800">{label}</span>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgentBuilderClient({ departments }: Props) {
  const router = useRouter();

  // ── Section 1: Identity ────────────────────────────────────────────────────
  const [name,       setName]       = useState("");
  const [emoji,      setEmoji]      = useState("");
  const [department, setDepartment] = useState("");
  const [vibe,       setVibe]       = useState("");

  // ── Section 2: Soul ────────────────────────────────────────────────────────
  const [soulValues, setSoulValues] = useState("");
  const [commStyle,  setCommStyle]  = useState("");
  const [expertise,  setExpertise]  = useState("");

  // ── Section 3: Skills ──────────────────────────────────────────────────────
  const [allowGmail,      setAllowGmail]      = useState(false);
  const [allowWeb,        setAllowWeb]        = useState(false);
  const [allowFiles,      setAllowFiles]      = useState(false);
  const [askBeforeTools,  setAskBeforeTools]  = useState(true);
  const [responseStyle,   setResponseStyle]   = useState<ResponseStyle>("balanced");

  // ── Section 4: Rules ───────────────────────────────────────────────────────
  const [rules,   setRules]   = useState("");
  const [neverDo, setNeverDo] = useState("");

  // ── Submit state ───────────────────────────────────────────────────────────
  const [saving,   setSaving]   = useState(false);
  const [saveErr,  setSaveErr]  = useState<string | null>(null);

  // ── Live preview ───────────────────────────────────────────────────────────
  const systemPrompt = useMemo(
    () => composeSystemPrompt({ name, emoji, vibe, soulValues, commStyle, expertise, rules, neverDo }),
    [name, emoji, vibe, soulValues, commStyle, expertise, rules, neverDo],
  );

  // ── Emoji presets ──────────────────────────────────────────────────────────
  const EMOJI_PRESETS = ["🤖", "🧠", "⚡", "🦊", "🐉", "🌟", "💡", "🔮", "🎯", "🦁", "🐺", "🦋"];

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setSaveErr("Agent name is required."); return; }

    setSaving(true);
    setSaveErr(null);

    try {
      const res = await fetch("/api/agents", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:             name.trim(),
          description:      vibe.trim(),
          system_prompt:    systemPrompt,
          default_model:    "openclaw:main",
          department:       department || "",
          allow_web:        allowWeb,
          allow_files:      allowFiles,
          ask_before_tools: askBeforeTools,
          ask_before_web:   askBeforeTools,
          ask_before_files: askBeforeTools,
          response_style:   responseStyle,
        }),
      });

      const data = await res.json() as { agent?: { id: string; department?: string }; error?: string };

      if (!res.ok) {
        setSaveErr(data.error ?? "Failed to create agent");
        return;
      }

      const agent = data.agent!;
      const dept  = agent.department?.trim() || department.trim();

      if (dept) {
        // ── Also patch allow_web now (POST only sets defaults, PUT sets all) ──
        // The POST route accepts allow_web etc — no extra PUT needed.
        router.push(`/agents/${dept}/${agent.id}`);
      } else {
        // No department chosen — land on edit page so they can set it
        router.push(`/agents/edit/${agent.id}`);
      }
    } catch {
      setSaveErr("Network error — could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  // ── Selected dept for display ──────────────────────────────────────────────
  const selectedDept = departments.find((d) => d.id === department);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/agents"
              className="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors shrink-0"
            >
              ← Agents
            </a>
            <span className="text-gray-200">/</span>
            <div className="flex items-center gap-2 min-w-0">
              {emoji && (
                <span className="text-lg leading-none">{emoji}</span>
              )}
              <span className="text-sm font-semibold text-gray-900 truncate">
                {name || "New Agent"}
              </span>
              {selectedDept && (
                <span
                  className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
                  style={{
                    background: selectedDept.color + "20",
                    color:      selectedDept.dark,
                    borderColor: selectedDept.color + "40",
                  }}
                >
                  {selectedDept.emoji} {selectedDept.label}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/agents"
              className="text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
            >
              Cancel
            </a>
            <button
              form="agent-builder-form"
              type="submit"
              disabled={saving || !name.trim()}
              className="text-xs font-semibold text-white px-4 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {saving ? "Creating…" : department ? "Create & Talk →" : "Create Agent"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Build Agent
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure every aspect of your agent — identity, soul, skills, and rules.
            Each section maps to an OpenClaw workspace file.
          </p>
        </div>

        <form id="agent-builder-form" onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* ── Section 1: Identity ────────────────────────────────────────── */}
          <Section
            file="IDENTITY.md"
            title="Identity"
            subtitle="Who this agent is — name, appearance, personality tagline."
          >
            <div className="grid grid-cols-[1fr_auto] gap-4">
              <Field label="Agent name *" hint="The name this agent goes by.">
                <input
                  type="text"
                  placeholder="e.g. Maya, Atlas, Nova…"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  required
                  autoFocus
                />
              </Field>

              <Field label="Emoji">
                <input
                  type="text"
                  placeholder="🤖"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
                  className={`${inputCls} w-16 text-center text-xl`}
                />
              </Field>
            </div>

            {/* Emoji presets */}
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_PRESETS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center border transition-all ${
                    emoji === e
                      ? "border-violet-400 bg-violet-50"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>

            <Field label="Department" hint="Which team this agent belongs to.">
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className={inputCls}
              >
                <option value="">— No department —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.emoji} {d.label} — {d.tagline}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Vibe / tagline"
              hint="One line describing this agent's personality. Becomes the opening line of the system prompt."
            >
              <input
                type="text"
                placeholder="e.g. Sharp, direct, and always gives honest feedback."
                value={vibe}
                onChange={(e) => setVibe(e.target.value)}
                className={inputCls}
              />
            </Field>
          </Section>

          {/* ── Section 2: Soul ────────────────────────────────────────────── */}
          <Section
            file="SOUL.md"
            title="Soul"
            subtitle="Core values and personality. This is who the agent is, not just what it does."
          >
            <Field
              label="Core values & personality"
              hint="What does this agent believe in? What principles guide its behavior?"
            >
              <textarea
                rows={4}
                placeholder={`e.g.\n- Be genuinely helpful, not performatively cautious\n- Have opinions and share them clearly\n- Be resourceful — explore options before asking clarifying questions\n- Earn trust through competence, not compliance`}
                value={soulValues}
                onChange={(e) => setSoulValues(e.target.value)}
                className={textareaCls}
              />
            </Field>

            <Field
              label="Communication style"
              hint="How does this agent speak? Tone, formality, response length preferences."
            >
              <textarea
                rows={3}
                placeholder="e.g. Concise and direct. Skip filler phrases. Use bullet points for lists. Mirror the user's level of formality."
                value={commStyle}
                onChange={(e) => setCommStyle(e.target.value)}
                className={textareaCls}
              />
            </Field>

            <Field
              label="Expertise & focus areas"
              hint="What domains does this agent know deeply? What should users come to it for?"
            >
              <textarea
                rows={3}
                placeholder="e.g. Campaign strategy, A/B testing, audience segmentation, copywriting, performance analytics."
                value={expertise}
                onChange={(e) => setExpertise(e.target.value)}
                className={textareaCls}
              />
            </Field>
          </Section>

          {/* ── Section 3: Skills ──────────────────────────────────────────── */}
          <Section
            file="TOOLS.md / skills"
            title="Skills & Tool Access"
            subtitle="What this agent can do. Grants access to external tools and sets response behaviour."
          >
            <div className="flex flex-col gap-3">
              <Toggle
                checked={allowGmail}
                onChange={setAllowGmail}
                label="Gmail — read emails"
                description="Allows this agent to search and read Gmail messages via the connected account."
              />
              <Toggle
                checked={allowWeb}
                onChange={setAllowWeb}
                label="Web search"
                description="Allows this agent to search the web for current information."
              />
              <Toggle
                checked={allowFiles}
                onChange={setAllowFiles}
                label="File access"
                description="Allows this agent to read uploaded files and documents."
              />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <Toggle
                checked={askBeforeTools}
                onChange={setAskBeforeTools}
                label="Ask before using tools"
                description="Agent will request your permission before running Gmail, web, or file tools."
              />
            </div>

            <div className="border-t border-gray-100 pt-4">
              <Field label="Response style" hint="Controls how long and detailed replies are by default.">
                <div className="flex gap-2">
                  {(["brief", "balanced", "detailed"] as ResponseStyle[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setResponseStyle(s)}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border capitalize transition-all ${
                        responseStyle === s
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </Section>

          {/* ── Section 4: Rules ───────────────────────────────────────────── */}
          <Section
            file="AGENTS.md"
            title="Rules"
            subtitle="Specific behavioral guidelines — what this agent must always or never do."
          >
            <Field
              label="Behavioral rules"
              hint="Specific things this agent should always do or how it should handle edge cases."
            >
              <textarea
                rows={4}
                placeholder={`e.g.\n- Always cite sources when stating facts\n- If a task needs a tool, say so before attempting it\n- When given vague instructions, ask one clarifying question\n- Never speculate about legal or medical matters`}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                className={textareaCls}
              />
            </Field>

            <Field
              label="Off-limits"
              hint="Topics, tasks, or behaviors this agent should refuse or redirect."
            >
              <textarea
                rows={3}
                placeholder="e.g. Do not write code. Do not provide financial advice. Redirect HR questions to the support team."
                value={neverDo}
                onChange={(e) => setNeverDo(e.target.value)}
                className={textareaCls}
              />
            </Field>
          </Section>

          {/* ── Section 5: System Prompt Preview ───────────────────────────── */}
          <section className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-baseline gap-3">
                <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded px-1.5 py-0.5">
                  system_prompt
                </span>
                <span className="text-sm font-semibold text-gray-200">Live Preview</span>
              </div>
              <span className="text-xs text-gray-500">
                {systemPrompt.length} chars
              </span>
            </div>
            <pre className="px-6 py-5 text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap overflow-auto max-h-64">
              {systemPrompt || (
                <span className="text-gray-600 italic">
                  Start filling in the sections above to see your agent&apos;s system prompt take shape…
                </span>
              )}
            </pre>
          </section>

          {/* ── Error + submit ─────────────────────────────────────────────── */}
          {saveErr && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-5 py-4">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <p className="text-sm text-red-700">{saveErr}</p>
            </div>
          )}

          <div className="flex items-center justify-between pb-10">
            <a
              href="/agents"
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              ← Cancel
            </a>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex items-center gap-2 text-sm font-semibold text-white px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {saving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
                  </svg>
                  Creating…
                </>
              ) : department ? (
                "Create & Talk →"
              ) : (
                "Create Agent"
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
