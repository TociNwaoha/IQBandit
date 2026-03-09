"use client";
/**
 * app/mission-control/live/page.tsx
 * Live Feed — polls /api/mission-control/feed every 5s.
 */

import { useState, useEffect, useCallback } from "react";

interface FeedItem {
  type:       "chat" | "tool";
  id:         string;
  timestamp:  string;
  success:    boolean;
  email?:     string;
  model?:     string;
  latency_ms?: number;
  error_message?: string;
  provider_id?:  string;
  action?:       string;
  agent_id?:     string;
  conversation_id?: string;
  error_code?:   string;
  approval_id?:  string;
}

function FeedItemRow({ item }: { item: FeedItem }) {
  const isError = !item.success;
  return (
    <div className={`flex items-start gap-3 py-3 border-b border-gray-100 last:border-0 ${isError ? "bg-red-50/30" : ""}`}>
      <div className="mt-0.5 shrink-0">
        <span className={`inline-block w-2 h-2 rounded-full ${item.success ? "bg-emerald-400" : "bg-red-400"}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded font-mono font-medium ${
            item.type === "chat" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"
          }`}>
            {item.type}
          </span>
          {item.type === "chat" ? (
            <span className="text-sm text-gray-700">{item.model ?? "?"}</span>
          ) : (
            <span className="text-sm font-mono text-gray-700">{item.provider_id}/{item.action}</span>
          )}
          {item.latency_ms !== undefined && (
            <span className="text-xs text-gray-400">{item.latency_ms}ms</span>
          )}
          {item.agent_id && (
            <span className="text-xs text-gray-400 font-mono">{item.agent_id.slice(0, 8)}…</span>
          )}
          {item.approval_id && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">approval</span>
          )}
        </div>
        {isError && (item.error_message || item.error_code) && (
          <p className="text-xs text-red-500 mt-0.5">{item.error_message ?? item.error_code}</p>
        )}
        <p className="text-xs text-gray-400 mt-0.5">{new Date(item.timestamp).toLocaleTimeString()}</p>
      </div>
    </div>
  );
}

export default function LiveFeedPage() {
  const [items,       setItems]       = useState<FeedItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [errorsOnly,  setErrorsOnly]  = useState(false);
  const [provider,    setProvider]    = useState("");
  const [action,      setAction]      = useState("");
  const [model,       setModel]       = useState("");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchFeed = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    if (errorsOnly) params.set("errors_only", "1");
    if (provider)   params.set("provider", provider);
    if (action)     params.set("action", action);
    if (model)      params.set("model", model);

    try {
      const res  = await fetch(`/api/mission-control/feed?${params.toString()}`);
      const data = await res.json() as { items?: FeedItem[] };
      setItems(data.items ?? []);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [errorsOnly, provider, action, model]);

  // Poll every 5s
  useEffect(() => {
    void fetchFeed();
    const interval = setInterval(() => { void fetchFeed(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchFeed]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live Feed</h1>
          <p className="text-sm text-gray-500 mt-1">Unified activity stream · auto-refreshes every 30s</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-400">{lastUpdated ? `Updated ${lastUpdated}` : "Connecting…"}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)}
            className="rounded" />
          <span className="text-sm text-gray-600">Errors only</span>
        </label>
        <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Provider"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-32 focus:outline-none focus:ring-2 focus:ring-violet-300" />
        <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-32 focus:outline-none focus:ring-2 focus:ring-violet-300" />
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model"
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-violet-300" />
      </div>

      {/* Feed */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 min-h-[200px]">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading feed…</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No activity yet{errorsOnly ? " (errors only filter active)" : ""}.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 px-4">
            {items.map((item) => <FeedItemRow key={`${item.type}-${item.id}`} item={item} />)}
          </div>
        )}
      </div>
    </div>
  );
}
