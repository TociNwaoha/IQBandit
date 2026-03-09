"use client";
/**
 * app/mission-control/memory/page.tsx
 * Memory Browser — search conversation messages.
 */

import { useState, useCallback } from "react";

interface SearchResult {
  msg_id:          string;
  content:         string;
  role:            string;
  created_at:      string;
  conversation_id: string;
  conv_title:      string;
  conv_agent_id:   string;
  prev?:           string;
  next?:           string;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function MemoryPage() {
  const [query,    setQuery]    = useState("");
  const [agentId,  setAgentId]  = useState("");
  const [convId,   setConvId]   = useState("");
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query });
      if (agentId) params.set("agent_id", agentId);
      if (convId)  params.set("conversation_id", convId);
      const res  = await fetch(`/api/mission-control/memory/search?${params.toString()}`);
      const data = await res.json() as { results?: SearchResult[] };
      setResults(data.results ?? []);
      setSearched(true);
    } finally { setLoading(false); }
  }, [query, agentId, convId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Memory Browser</h1>
        <p className="text-sm text-gray-500 mt-1">Search through conversation messages</p>
      </div>

      {/* Search form */}
      <form onSubmit={(e) => { void search(e); }} className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 text-sm border border-gray-200 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-5 py-2.5 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
        <div className="flex gap-2">
          <input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="Filter by Agent ID (optional)"
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-violet-300" />
          <input value={convId} onChange={(e) => setConvId(e.target.value)} placeholder="Filter by Conversation ID (optional)"
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 flex-1 focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
      </form>

      {/* Results */}
      {searched && (
        results.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <p className="text-gray-400">No messages found for &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;</p>
            {results.map((r) => (
              <div key={r.msg_id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${r.role === "user" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-600"}`}>
                      {r.role}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">{r.conv_title}</span>
                    {r.conv_agent_id && (
                      <span className="text-xs text-gray-300 font-mono">agent:{r.conv_agent_id.slice(0, 8)}…</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</span>
                </div>

                {/* Context */}
                {r.prev && (
                  <p className="text-xs text-gray-300 italic pl-3 border-l-2 border-gray-100">
                    ↑ {r.prev}{r.prev.length >= 100 ? "…" : ""}
                  </p>
                )}
                <p className="text-sm text-gray-800 leading-relaxed">
                  {highlightMatch(r.content, query)}
                </p>
                {r.next && (
                  <p className="text-xs text-gray-300 italic pl-3 border-l-2 border-gray-100">
                    ↓ {r.next}{r.next.length >= 100 ? "…" : ""}
                  </p>
                )}

                <p className="text-xs text-gray-300 font-mono">conv:{r.conversation_id.slice(0, 12)}…</p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
