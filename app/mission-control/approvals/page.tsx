"use client";
/**
 * app/mission-control/approvals/page.tsx
 * Approvals Queue — governance center. Lists pending approvals; allows approve/deny/execute.
 */

import { useState, useEffect, useCallback } from "react";

interface Approval {
  id:            string;
  status:        string;
  provider_id:   string;
  action:        string;
  policy_key:    string;
  input_json:    string;
  metadata_json: string;
  reason:        string;
  created_at:    string;
  expires_at:    string;
}

interface Policy {
  id:                string;
  name:              string;
  enabled:           boolean;
  match_provider_id: string;
  match_action:      string;
  threshold_type:    string;
  threshold_value:   number;
  require_approval:  boolean;
  notes:             string;
}

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    pending:  "bg-amber-50 text-amber-700 border-amber-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    denied:   "bg-red-50 text-red-600 border-red-200",
    expired:  "bg-gray-100 text-gray-500 border-gray-200",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${cls[status] ?? cls.expired}`}>
      {status}
    </span>
  );
}

function ApprovalRow({ approval, onDecide, onExecute }: {
  approval: Approval;
  onDecide: (id: string, decision: "approved" | "denied", reason: string) => Promise<void>;
  onExecute: (id: string) => Promise<void>;
}) {
  const [reason, setReason]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [exResult, setExResult] = useState<string | null>(null);

  const meta = (() => { try { return JSON.parse(approval.metadata_json) as Record<string, unknown>; } catch { return {}; } })();

  async function decide(decision: "approved" | "denied") {
    setLoading(true);
    await onDecide(approval.id, decision, reason);
    setLoading(false);
  }

  async function execute() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/execute-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_id: approval.id }),
      });
      const data = await res.json() as Record<string, unknown>;
      setExResult(res.ok ? "✅ Executed successfully" : `❌ ${String(data.error ?? "Failed")}`);
      await onExecute(approval.id);
    } finally { setLoading(false); }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={approval.status} />
            <span className="font-mono text-sm font-semibold text-gray-800">
              {approval.provider_id} / {approval.action}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            ID: {approval.id.slice(0, 8)}… · {new Date(approval.created_at).toLocaleString()}
            {approval.expires_at && ` · Expires: ${new Date(approval.expires_at).toLocaleString()}`}
          </p>
        </div>
      </div>

      {/* Metadata */}
      {Object.keys(meta).length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-0.5">
          {Object.entries(meta).map(([k, v]) => (
            <div key={k}><span className="text-gray-400">{k}:</span> {String(v)}</div>
          ))}
        </div>
      )}

      {/* Input preview */}
      {approval.input_json && approval.input_json !== "{}" && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Input (sanitized):</p>
          <pre className="text-xs bg-gray-50 rounded p-2 overflow-x-auto text-gray-600">{approval.input_json}</pre>
        </div>
      )}

      {/* Policy key */}
      {approval.policy_key && (
        <p className="text-xs text-gray-400">Policy: <span className="font-mono">{approval.policy_key.slice(0, 16)}…</span></p>
      )}

      {/* Reason (shown after decision) */}
      {approval.reason && (
        <p className="text-xs text-gray-600 italic">Reason: {approval.reason}</p>
      )}

      {/* Execute result */}
      {exResult && <p className="text-sm font-medium">{exResult}</p>}

      {/* Actions */}
      {approval.status === "pending" && (
        <div className="flex flex-col gap-2 pt-1">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional for approve, recommended for deny)…"
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
          <div className="flex gap-2">
            <button
              onClick={() => decide("approved")}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => decide("denied")}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              Deny
            </button>
          </div>
        </div>
      )}

      {approval.status === "approved" && (
        <button
          onClick={execute}
          disabled={loading || !!exResult}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {loading ? "Executing…" : "Execute Now"}
        </button>
      )}
    </div>
  );
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [policies,  setPolicies]  = useState<Policy[]>([]);
  const [filter,    setFilter]    = useState<"all" | "pending" | "approved" | "denied">("pending");
  const [tab,       setTab]       = useState<"approvals" | "policies">("approvals");
  const [loading,   setLoading]   = useState(true);

  // New policy form
  const [pName,         setPName]         = useState("");
  const [pProvider,     setPProvider]     = useState("*");
  const [pAction,       setPAction]       = useState("*");
  const [pThreshType,   setPThreshType]   = useState("");
  const [pThreshValue,  setPThreshValue]  = useState(0);
  const [pSaving,       setPSaving]       = useState(false);
  const [pError,        setPError]        = useState("");

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter === "all" ? "/api/mission-control/approvals" : `/api/mission-control/approvals?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json() as { approvals?: Approval[] };
      setApprovals(data.approvals ?? []);
    } finally { setLoading(false); }
  }, [filter]);

  const fetchPolicies = useCallback(async () => {
    const res  = await fetch("/api/mission-control/approvals?mode=policies");
    const data = await res.json() as { policies?: Policy[] };
    setPolicies(data.policies ?? []);
  }, []);

  useEffect(() => { void fetchApprovals(); }, [fetchApprovals]);
  useEffect(() => { if (tab === "policies") void fetchPolicies(); }, [tab, fetchPolicies]);

  async function decide(id: string, decision: "approved" | "denied", reason: string) {
    await fetch(`/api/mission-control/approvals/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ decision, reason }),
    });
    await fetchApprovals();
  }

  async function savePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!pName.trim()) { setPError("Policy name is required"); return; }
    setPSaving(true); setPError("");
    const res = await fetch("/api/mission-control/approvals", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        type: "policy", name: pName.trim(),
        match_provider_id: pProvider, match_action: pAction,
        threshold_type: pThreshType, threshold_value: pThreshValue,
        require_approval: true,
      }),
    });
    if (res.ok) {
      setPName(""); setPProvider("*"); setPAction("*"); setPThreshType(""); setPThreshValue(0);
      await fetchPolicies();
    } else {
      const d = await res.json() as { error?: string };
      setPError(d.error ?? "Failed to save policy");
    }
    setPSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
          <p className="text-sm text-gray-500 mt-1">Governance queue — approve or deny gated tool executions</p>
        </div>
        <button onClick={() => void fetchApprovals()}
          className="text-xs text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300">
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(["approvals", "policies"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? "border-violet-600 text-violet-700" : "border-transparent text-gray-500 hover:text-gray-900"}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "approvals" && (
        <>
          {/* Status filter */}
          <div className="flex gap-1">
            {(["pending", "approved", "denied", "all"] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === f ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:bg-gray-100"}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : approvals.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-gray-400 text-sm">No {filter} approvals</p>
              {filter === "pending" && <p className="text-gray-400 text-xs mt-1">Create a policy to gate tool executions</p>}
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map((a) => (
                <ApprovalRow
                  key={a.id}
                  approval={a}
                  onDecide={decide}
                  onExecute={async () => { await fetchApprovals(); }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === "policies" && (
        <div className="space-y-6">
          {/* Create policy form */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Create Approval Policy</h3>
            <form onSubmit={(e) => { void savePolicy(e); }} className="space-y-3">
              {pError && <p className="text-sm text-red-500">{pError}</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Policy name *"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300" />
                <input value={pProvider} onChange={(e) => setPProvider(e.target.value)} placeholder="Provider (* = all)"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300" />
                <input value={pAction} onChange={(e) => setPAction(e.target.value)} placeholder="Action (* = all)"
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300" />
                <select value={pThreshType} onChange={(e) => setPThreshType(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300">
                  <option value="">No threshold (always require)</option>
                  <option value="count">Count threshold</option>
                  <option value="estimated_cost">Cost threshold</option>
                </select>
                {pThreshType && (
                  <input type="number" value={pThreshValue} onChange={(e) => setPThreshValue(Number(e.target.value))}
                    placeholder="Threshold value"
                    className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300" />
                )}
              </div>
              <button type="submit" disabled={pSaving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                {pSaving ? "Saving…" : "Create Policy"}
              </button>
            </form>
          </div>

          {/* Existing policies */}
          {policies.length === 0 ? (
            <p className="text-sm text-gray-400">No policies yet. Create one above to gate tool executions.</p>
          ) : (
            <div className="space-y-3">
              {policies.map((p) => (
                <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5 font-mono">
                        {p.match_provider_id}/{p.match_action}
                        {p.threshold_type && ` · ${p.threshold_type} > ${p.threshold_value}`}
                      </p>
                      {p.notes && <p className="text-xs text-gray-400 mt-1 italic">{p.notes}</p>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${p.enabled ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {p.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
