"use client";

/**
 * app/mission-control/workspace/page.tsx
 * View and edit the OpenClaw workspace markdown files
 * (~/.openclaw/workspace/SOUL.md, AGENTS.md, IDENTITY.md, USER.md, etc.)
 * that are injected into every LLM system prompt.
 */

import { useState, useEffect, useCallback } from "react";

const FILES = [
  { name: "SOUL.md",      description: "Core values, personality, vibe" },
  { name: "IDENTITY.md",  description: "Name, creature type, emoji, avatar" },
  { name: "USER.md",      description: "Context about the human being helped" },
  { name: "AGENTS.md",    description: "Workspace rules, memory conventions, tool safety" },
  { name: "MEMORY.md",    description: "Long-term curated memory" },
  { name: "TOOLS.md",     description: "Local tool notes (camera names, SSH details, etc.)" },
  { name: "HEARTBEAT.md", description: "Periodic check-in instructions" },
] as const;

type FileName = typeof FILES[number]["name"];

export default function WorkspacePage() {
  const [selected, setSelected] = useState<FileName>("SOUL.md");
  const [contents, setContents] = useState<Record<string, string>>({});
  const [draft, setDraft]       = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);
  const [savedAt, setSavedAt]   = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);

  // Load all files on mount
  useEffect(() => {
    fetch("/api/workspace")
      .then((r) => r.json() as Promise<Record<string, string>>)
      .then((data) => {
        setContents(data);
        setDraft(data);
      })
      .catch(() => setError("Failed to load workspace files."));
  }, []);

  const currentDraft   = draft[selected]   ?? "";
  const currentSaved   = contents[selected] ?? "";
  const hasUnsaved     = currentDraft !== currentSaved;

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspace/${selected}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ content: currentDraft }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setContents((prev) => ({ ...prev, [selected]: currentDraft }));
      setSavedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [selected, currentDraft]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Workspace Files</h1>
        <p className="text-sm text-gray-500 mt-1">
          These files live in <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">~/.openclaw/workspace/</code> and are injected into every LLM system prompt.
        </p>
      </div>

      <div className="flex gap-6 min-h-[600px]">
        {/* File list */}
        <div className="w-52 shrink-0 flex flex-col gap-1">
          {FILES.map(({ name, description }) => {
            const isActive = name === selected;
            const isDirty  = (draft[name] ?? "") !== (contents[name] ?? "");
            return (
              <button
                key={name}
                onClick={() => setSelected(name)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  isActive
                    ? "bg-violet-50 border-violet-200 text-violet-800"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-semibold">{name}</span>
                  {isDirty && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Unsaved changes" />
                  )}
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{description}</p>
              </button>
            );
          })}
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800 font-mono">{selected}</span>
              {hasUnsaved && (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  Unsaved
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {savedAt && !hasUnsaved && (
                <span className="text-xs text-emerald-600">Saved {savedAt}</span>
              )}
              {error && <span className="text-xs text-red-500">{error}</span>}
              <button
                onClick={handleSave}
                disabled={saving || !hasUnsaved}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>

          <textarea
            value={currentDraft}
            onChange={(e) => setDraft((prev) => ({ ...prev, [selected]: e.target.value }))}
            className="flex-1 min-h-[520px] w-full font-mono text-sm text-gray-800 bg-white border border-gray-200 rounded-xl p-4 resize-none focus:outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-200"
            placeholder={`${selected} is empty — add content here`}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}
