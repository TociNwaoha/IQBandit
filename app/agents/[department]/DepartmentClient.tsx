"use client";

/**
 * app/agents/[department]/DepartmentClient.tsx
 * "Inside the building" view.
 *
 * Shows a pixel-art office room (PixelOfficeRoom) with two workstations
 * for the two most-appropriate agents, plus a compact roster panel
 * for any additional agents.
 *
 * Presence polling:
 *  - Fetches /api/agents/presence every 5 s.
 *  - LIVE presence overrides the message-recency status heuristic.
 *
 * Desk priority:
 *  1. Pinned agents (localStorage, per-department)
 *  2. LIVE working agents (presence.isWorking = true)
 *  3. Most-recently active (lastActive DESC)
 *  4. Alphabetical tie-breaker
 *
 * Exports AgentWithActivity so page.tsx can assemble the enriched agent list
 * server-side and pass it in as props.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter }       from "next/navigation";
import Link                from "next/link";
import type { Agent }      from "@/lib/agents";
import type { Department } from "@/lib/departments";
import PixelOfficeRoom     from "./PixelOfficeRoom";
import {
  computeStatus,
  formatLastActive,
  STATUS_COLOR,
}                          from "./agentStatus";

/* ─── Extended agent type ─────────────────────────────────────────────────── */

export interface AgentWithActivity extends Agent {
  lastActive?:  string; // ISO timestamp of most-recent message
  lastPreview?: string; // first 60 chars of most-recent message
}

/* ─── Client-side presence type (no server import) ──────────────────────── */

interface PresenceInfo {
  isWorking:      boolean;
  /** Formatted display note for the Workstation card (derived from note/activity/detail). */
  displayNote:    string;
  /** Mirrors server-side PresenceStatus — drives LIVE badge visibility. */
  presenceStatus: "live" | "stale" | "offline";
  /** Semantic activity label — "responding" | "tooling" | "idle" | "" */
  activity:       string;
}
type PresenceMap = Record<string, PresenceInfo>;

/* ─── Palette ─────────────────────────────────────────────────────────────── */

const P = {
  bg:     "#0A0A16",
  card:   "#111128",
  border: "#1E1E40",
  fg:     "#E2E2FF",
  sub:    "#6868A0",
  dim:    "#303058",
  muted:  "#0D0D22",
};

/* ─── Compact roster row (agents 3+) ─────────────────────────────────────── */

function RosterRow({
  agent,
  dept,
  pinnedDesk1,
  pinnedDesk2,
  onPin,
  forceWorking = false,
}: {
  agent:         AgentWithActivity;
  dept:          Department;
  pinnedDesk1:   boolean;
  pinnedDesk2:   boolean;
  onPin:         (desk: 1 | 2) => void;
  /** When true, overrides message-recency status with WORKING (live presence). */
  forceWorking?: boolean;
}) {
  const baseStatus  = computeStatus(agent.lastActive);
  const status      = forceWorking ? "WORKING" : baseStatus;
  const lastActive  = formatLastActive(agent.lastActive);
  const statusColor = STATUS_COLOR[status];

  // Accessible tooltip: status + last-active + preview snippet
  const tooltipParts = [
    `Status: ${status}`,
    agent.lastActive ? `Last active: ${lastActive}` : "Never active",
    agent.lastPreview ? `"${agent.lastPreview.slice(0, 60)}"` : "",
  ].filter(Boolean);
  // Note: forceWorking comes from presenceMap.isWorking; no access to activity here

  return (
    <div
      title={tooltipParts.join(" · ")}
      style={{
        display:     "flex",
        alignItems:  "center",
        gap:         8,
        padding:     "10px 16px",
        borderBottom:`1px solid ${P.border}`,
        background:  P.muted,
        cursor:      "default",
      }}
    >
      {/* Status dot */}
      <span
        aria-label={`Status: ${status}`}
        style={{
          display:        "inline-block",
          width:          7,
          height:         7,
          background:     statusColor,
          flexShrink:     0,
          imageRendering: "pixelated",
        }}
      />

      {/* Name */}
      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      7,
        color:         dept.color,
        letterSpacing: "0.04em",
        flex:          1,
        minWidth:      0,
        overflow:      "hidden",
        textOverflow:  "ellipsis",
        whiteSpace:    "nowrap",
      }}>
        {agent.name}
      </div>

      {/* Status label */}
      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      5,
        color:         statusColor,
        letterSpacing: "0.12em",
        whiteSpace:    "nowrap",
        flexShrink:    0,
      }}>
        {status}
      </div>

      {/* Last active */}
      <div style={{
        fontFamily: "monospace",
        fontSize:   10,
        color:      P.sub,
        whiteSpace: "nowrap",
        flexShrink: 0,
        minWidth:   60,
        textAlign:  "right",
      }}>
        {lastActive}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>

        {/* Pin desk 1 */}
        <button
          onClick={() => onPin(1)}
          title={pinnedDesk1 ? "Unpin from Desk 1" : "Pin to Desk 1"}
          aria-label={pinnedDesk1 ? `Unpin ${agent.name} from desk 1` : `Pin ${agent.name} to desk 1`}
          style={{
            fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
            fontSize:      5,
            color:         pinnedDesk1 ? "#080812" : P.sub,
            background:    pinnedDesk1 ? dept.color : "transparent",
            border:        `1px solid ${pinnedDesk1 ? dept.color : P.border}`,
            padding:       "4px 5px",
            cursor:        "pointer",
            letterSpacing: "0.06em",
            whiteSpace:    "nowrap",
          }}
        >
          📌1
        </button>

        {/* Pin desk 2 */}
        <button
          onClick={() => onPin(2)}
          title={pinnedDesk2 ? "Unpin from Desk 2" : "Pin to Desk 2"}
          aria-label={pinnedDesk2 ? `Unpin ${agent.name} from desk 2` : `Pin ${agent.name} to desk 2`}
          style={{
            fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
            fontSize:      5,
            color:         pinnedDesk2 ? "#080812" : P.sub,
            background:    pinnedDesk2 ? dept.color : "transparent",
            border:        `1px solid ${pinnedDesk2 ? dept.color : P.border}`,
            padding:       "4px 5px",
            cursor:        "pointer",
            letterSpacing: "0.06em",
            whiteSpace:    "nowrap",
          }}
        >
          📌2
        </button>

        <Link
          href={`/agents/${dept.id}/${agent.id}`}
          aria-label={`Chat with ${agent.name}`}
          style={{
            fontFamily:     "var(--font-pixel, 'Courier New', monospace)",
            fontSize:       5,
            color:          "#080812",
            background:     dept.color,
            textDecoration: "none",
            padding:        "5px 10px",
            letterSpacing:  "0.1em",
            display:        "inline-block",
            whiteSpace:     "nowrap",
          }}
        >
          CHAT →
        </Link>
        <Link
          href={`/agents/edit/${agent.id}`}
          aria-label={`Edit settings for ${agent.name}`}
          style={{
            fontFamily:     "var(--font-pixel, 'Courier New', monospace)",
            fontSize:       5,
            color:          P.sub,
            border:         `1px solid ${P.border}`,
            textDecoration: "none",
            padding:        "5px 8px",
            letterSpacing:  "0.1em",
            display:        "inline-flex",
            alignItems:     "center",
          }}
        >
          ⚙
        </Link>
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────────── */

export default function DepartmentClient({
  dept,
  agents,
}: {
  dept:   Department;
  agents: AgentWithActivity[];
}) {
  const router = useRouter();

  const [creating,      setCreating]      = useState(false);
  const [createErr,     setCreateErr]     = useState<string | null>(null);
  const [agentName,     setAgentName]     = useState("");
  const [showForm,      setShowForm]      = useState(false);
  const [presenceMap,   setPresenceMap]   = useState<PresenceMap>({});
  const [pinnedDesk1Id, setPinnedDesk1Id] = useState("");
  const [pinnedDesk2Id, setPinnedDesk2Id] = useState("");

  const PINS_KEY        = `iq-bandit-dept-pins-${dept.id}`;
  const pollRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Tracks the timestamp until which each agent should still display WORKING
   *  despite a missed/late heartbeat — prevents flicker between polls. */
  const workingUntilRef = useRef<Record<string, number>>({});

  /* Load pinned desk assignments from localStorage on mount */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PINS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { d1?: string; d2?: string };
        if (typeof parsed.d1 === "string") setPinnedDesk1Id(parsed.d1);
        if (typeof parsed.d2 === "string") setPinnedDesk2Id(parsed.d2);
      }
    } catch {
      // localStorage unavailable or corrupt — ignore
    }
  // PINS_KEY is stable (derived from dept.id which never changes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Poll /api/agents/presence every 5 seconds */
  const agentIdsStr = agents.map((a) => a.id).join(",");

  useEffect(() => {
    if (!agentIdsStr) return;

    async function fetchPresence() {
      try {
        const res = await fetch(
          `/api/agents/presence?agentIds=${encodeURIComponent(agentIdsStr)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = await res.json() as {
          presence: Record<string, {
            is_working:      boolean;
            note:            string;
            activity?:       string;
            detail?:         string;
            presenceStatus?: "live" | "stale" | "offline";
          }>;
        };

        const now = Date.now();
        const map: PresenceMap = {};

        for (const [id, p] of Object.entries(data.presence)) {
          const pStatus  = p.presenceStatus ?? "offline";
          const activity = p.activity ?? "";
          const detail   = p.detail   ?? "";

          // Extend the grace window when a live+working heartbeat arrives
          if (p.is_working && pStatus === "live") {
            workingUntilRef.current[id] = now + 6_000;
          }

          // Grace: keep showing WORKING for up to 6 s after last live heartbeat
          // This smooths out gaps between heartbeat (5 s) and poll (5 s) intervals.
          const inGrace       = (workingUntilRef.current[id] ?? 0) > now;
          const effectiveWork = p.is_working || inGrace;

          // Derive a rich display note from activity + detail
          let displayNote = p.note;
          if (activity === "tooling") {
            displayNote = detail ? `Tooling: ${detail}` : "Running tool...";
          }

          map[id] = {
            isWorking:      effectiveWork,
            displayNote,
            presenceStatus: pStatus,
            activity,
          };
        }

        setPresenceMap(map);
      } catch {
        // Non-fatal — keep stale data
      }
    }

    fetchPresence();
    pollRef.current = setInterval(fetchPresence, 5_000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [agentIdsStr]);

  /* Priority-sorted agents:
     1. LIVE presence working agents first
     2. Most recently active (lastActive DESC)
     3. Alphabetical tie-breaker */
  const prioritySorted = useMemo<AgentWithActivity[]>(() => {
    return [...agents].sort((a, b) => {
      const aLive = presenceMap[a.id]?.isWorking ?? false;
      const bLive = presenceMap[b.id]?.isWorking ?? false;
      if (aLive !== bLive) return bLive ? 1 : -1;
      const aTime = a.lastActive ?? a.created_at;
      const bTime = b.lastActive ?? b.created_at;
      if (aTime !== bTime) return bTime.localeCompare(aTime);
      return a.name.localeCompare(b.name);
    });
  }, [agents, presenceMap]);

  /* Desk assignment respecting pinned overrides */
  const workstationPair = useMemo<[AgentWithActivity | null, AgentWithActivity | null]>(() => {
    if (agents.length === 0) return [null, null];

    // Desk 1: pinned agent if they still exist; otherwise top-priority agent
    const pinned1 = pinnedDesk1Id ? agents.find((a) => a.id === pinnedDesk1Id) : undefined;
    const desk1   = pinned1 ?? prioritySorted[0] ?? null;

    // Desk 2: pinned agent (if not same as desk 1); otherwise next priority agent
    const remaining    = prioritySorted.filter((a) => a.id !== desk1?.id);
    const pinned2Cand  = pinnedDesk2Id ? agents.find((a) => a.id === pinnedDesk2Id) : undefined;
    const validPinned2 = pinned2Cand?.id !== desk1?.id ? pinned2Cand : undefined;
    const desk2        = validPinned2 ?? remaining[0] ?? null;

    return [desk1, desk2];
  }, [agents, prioritySorted, pinnedDesk1Id, pinnedDesk2Id]);

  /* Roster: agents not assigned to a desk */
  const rosterAgents = useMemo<AgentWithActivity[]>(() => {
    const deskIds = new Set(
      [workstationPair[0]?.id, workstationPair[1]?.id].filter(Boolean) as string[],
    );
    return prioritySorted.filter((a) => !deskIds.has(a.id));
  }, [prioritySorted, workstationPair]);

  /* Pinning helpers */
  function savePins(d1: string, d2: string) {
    try { localStorage.setItem(PINS_KEY, JSON.stringify({ d1, d2 })); } catch {}
  }

  function pinToDesk(agentId: string, desk: 1 | 2) {
    if (desk === 1) {
      const newId = pinnedDesk1Id === agentId ? "" : agentId; // toggle
      setPinnedDesk1Id(newId);
      savePins(newId, pinnedDesk2Id);
    } else {
      const newId = pinnedDesk2Id === agentId ? "" : agentId;
      setPinnedDesk2Id(newId);
      savePins(pinnedDesk1Id, newId);
    }
  }

  /* Create new agent */
  async function buildAgent(e: React.FormEvent) {
    e.preventDefault();
    const name = agentName.trim() || `${dept.label} Agent`;
    setCreating(true);
    setCreateErr(null);
    try {
      const res  = await fetch("/api/agents", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, description: dept.description, department: dept.id }),
      });
      const data = await res.json() as { agent?: { id: string }; error?: string };
      if (!res.ok) { setCreateErr(data.error ?? "Failed"); return; }
      router.push(`/agents/edit/${data.agent!.id}`);
    } catch {
      setCreateErr("Network error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      {/* ── Global keyframes (used by all child components) ─────────────── */}
      <style>{`
        @keyframes think-bubble {
          0%, 100% { opacity: 0;   transform: scale(0.5); }
          40%, 60% { opacity: 1;   transform: scale(1);   }
        }
        @keyframes sprite-bob {
          0%, 100% { transform: translateY(0);   }
          50%      { transform: translateY(-4px); }
        }
        @keyframes blink-cursor {
          0%, 49%  { opacity: 1; }
          50%, 100%{ opacity: 0; }
        }
        @keyframes status-pulse {
          0%, 100% { opacity: 1;   }
          50%      { opacity: 0.28; }
        }
        @keyframes scanlines-scroll {
          from { background-position: 0 0;  }
          to   { background-position: 0 4px;}
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 1;   }
          50%      { opacity: 0.35; }
        }

        /* ── Walk-to-desk sprite positions ───────────────────────────────── */
        /* The wrapper div switches class when forceWorking changes.          */
        /* steps(6,end) gives a pixel-step feel rather than a smooth glide.  */
        .sprite-pos-standing { transform: translateY(0px);  }
        .sprite-pos-desk     { transform: translateY(8px);  }
        .sprite-pos-walking  {
          transition: transform 0.45s steps(6, end);
          will-change: transform;
        }

        /* ── Office ambience ──────────────────────────────────────────────── */
        /* Monitor screen glow pulse — active only when agent is WORKING.     */
        @keyframes monitor-glow-pulse {
          0%, 100% { opacity: 0.18; }
          45%, 55% { opacity: 0.42; }
        }
        .monitor-glow-active {
          animation: monitor-glow-pulse 2.6s ease-in-out infinite;
        }

        /* Desk lamp flicker — occasional 1-2% brightness dip, very subtle.  */
        @keyframes lamp-flicker {
          0%, 93%, 100% { opacity: 0.92; }
          94%           { opacity: 0.78; }
          95%           { opacity: 0.88; }
          96%           { opacity: 0.72; }
          97%           { opacity: 0.90; }
        }
        .lamp-shade-live {
          animation: lamp-flicker 9s step-end infinite;
        }

        /* Dust mote drift — 3 tiny particles float near the window.         */
        @keyframes dust-drift-a {
          0%   { transform: translate(0px,  0px);   opacity: 0.55; }
          30%  { transform: translate(3px,  -5px);  opacity: 0.75; }
          60%  { transform: translate(-2px, -9px);  opacity: 0.45; }
          100% { transform: translate(1px,  -14px); opacity: 0;    }
        }
        @keyframes dust-drift-b {
          0%   { transform: translate(0px,  0px);   opacity: 0.40; }
          40%  { transform: translate(-3px, -6px);  opacity: 0.65; }
          80%  { transform: translate(2px,  -11px); opacity: 0.30; }
          100% { transform: translate(-1px, -16px); opacity: 0;    }
        }
        @keyframes dust-drift-c {
          0%   { transform: translate(0px,  0px);   opacity: 0.50; }
          50%  { transform: translate(2px,  -7px);  opacity: 0.60; }
          100% { transform: translate(-2px, -13px); opacity: 0;    }
        }

        /* Stack workstations vertically on narrow screens */
        @media (max-width: 520px) {
          .workstation-row { flex-direction: column !important; }
        }

        /* Disable all animations for users who prefer reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .scanline-layer { display: none !important; }
          * { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div style={{
        minHeight:  "100vh",
        background: `
          radial-gradient(ellipse at 30% 0%, ${dept.glow.replace("0.35", "0.07")} 0%, transparent 55%),
          ${P.bg}
        `,
        color: P.fg,
      }}>

        {/* Dept accent strip */}
        <div style={{
          height:     3,
          background: `linear-gradient(90deg, ${dept.color}, ${dept.dark}, transparent)`,
        }} />

        {/* ── Header ────────────────────────────────────────────────────── */}
        <header style={{
          padding:      "16px 24px",
          borderBottom: `1px solid ${P.border}`,
          display:      "flex",
          alignItems:   "center",
          gap:          16,
          position:     "sticky",
          top:          0,
          zIndex:       20,
          background:   P.bg,
        }}>
          <Link
            href="/agents"
            style={{
              fontFamily:     "var(--font-pixel, monospace)",
              fontSize:       7,
              color:          P.sub,
              textDecoration: "none",
              border:         `1px solid ${P.border}`,
              padding:        "5px 9px",
              letterSpacing:  "0.12em",
              whiteSpace:     "nowrap",
            }}
          >
            ← HUB
          </Link>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }} aria-hidden="true">{dept.emoji}</span>
              <div style={{
                fontFamily:    "var(--font-pixel, monospace)",
                fontSize:      10,
                color:         dept.color,
                letterSpacing: "0.06em",
                textShadow:    `0 0 12px ${dept.glow}`,
              }}>
                {dept.label.toUpperCase()}
              </div>
            </div>
            <div style={{
              fontFamily: "monospace",
              fontSize:   11,
              color:      P.sub,
              marginTop:  4,
            }}>
              {dept.tagline}
            </div>
          </div>

          <div style={{
            fontFamily:    "var(--font-pixel, monospace)",
            fontSize:      7,
            color:         agents.length > 0 ? dept.color : P.dim,
            letterSpacing: "0.15em",
          }}>
            {agents.length} AGENT{agents.length !== 1 ? "S" : ""}
          </div>
        </header>

        {/* ── Main ──────────────────────────────────────────────────────── */}
        <main style={{ padding: "24px 24px 80px", maxWidth: 860, margin: "0 auto" }}>

          {/* Dept description */}
          <div style={{
            fontFamily:   "system-ui, -apple-system, sans-serif",
            fontSize:     13,
            color:        P.sub,
            lineHeight:   1.6,
            marginBottom: 24,
            maxWidth:     580,
          }}>
            {dept.description}
          </div>

          {/* Section header + Build button */}
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            marginBottom:   12,
          }}>
            <div style={{
              fontFamily:    "var(--font-pixel, monospace)",
              fontSize:      7,
              color:         P.sub,
              letterSpacing: "0.2em",
            }}>
              OFFICE FLOOR
            </div>
            <button
              onClick={() => { setShowForm(f => !f); setCreateErr(null); setAgentName(""); }}
              style={{
                fontFamily:    "var(--font-pixel, monospace)",
                fontSize:      7,
                color:         "#080812",
                background:    showForm ? P.sub : dept.color,
                border:        "none",
                padding:       "8px 14px",
                cursor:        "pointer",
                letterSpacing: "0.1em",
                transition:    "background 0.15s",
              }}
            >
              {showForm ? "CANCEL" : "+ BUILD NEW AGENT"}
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <form
              onSubmit={buildAgent}
              style={{
                display:      "flex",
                gap:          8,
                alignItems:   "stretch",
                marginBottom: 16,
                border:       `2px solid ${dept.color}`,
                padding:      "12px 14px",
                background:   P.muted,
              }}
            >
              <input
                autoFocus
                type="text"
                placeholder={`${dept.label} Agent name…`}
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                style={{
                  flex:       1,
                  fontFamily: "monospace",
                  fontSize:   12,
                  padding:    "8px 10px",
                  background: P.bg,
                  border:     `1px solid ${P.border}`,
                  color:      P.fg,
                  outline:    "none",
                }}
              />
              <button
                type="submit"
                disabled={creating}
                style={{
                  fontFamily:    "var(--font-pixel, monospace)",
                  fontSize:      7,
                  color:         "#080812",
                  background:    creating ? P.sub : dept.color,
                  border:        "none",
                  padding:       "8px 14px",
                  cursor:        creating ? "not-allowed" : "pointer",
                  letterSpacing: "0.1em",
                  whiteSpace:    "nowrap",
                }}
              >
                {creating ? "BUILDING..." : "CREATE →"}
              </button>
              {createErr && (
                <div style={{
                  fontFamily:    "var(--font-pixel, monospace)",
                  fontSize:      7,
                  color:         "#FF6B6B",
                  alignSelf:     "center",
                  letterSpacing: "0.08em",
                }}>
                  ✖ {createErr}
                </div>
              )}
            </form>
          )}

          {/* ── Pixel office room scene ──────────────────────────────────── */}
          <PixelOfficeRoom
            dept={dept}
            agents={workstationPair}
            presenceMap={presenceMap}
            agentCount={agents.length}
          />

          {/* ── Roster panel (agents beyond the first 2) ─────────────────── */}
          {rosterAgents.length > 0 && (
            <div style={{ marginTop: 2 }}>
              <div style={{
                fontFamily:    "var(--font-pixel, monospace)",
                fontSize:      6,
                color:         P.dim,
                letterSpacing: "0.2em",
                padding:       "10px 16px",
                background:    P.card,
                border:        `1px solid ${P.border}`,
                borderBottom:  "none",
              }}>
                ROSTER — {rosterAgents.length} MORE AGENT{rosterAgents.length !== 1 ? "S" : ""}
              </div>
              {rosterAgents.map((agent) => (
                <RosterRow
                  key={agent.id}
                  agent={agent}
                  dept={dept}
                  pinnedDesk1={pinnedDesk1Id === agent.id}
                  pinnedDesk2={pinnedDesk2Id === agent.id}
                  onPin={(desk) => pinToDesk(agent.id, desk)}
                  forceWorking={!!(presenceMap[agent.id]?.isWorking)}
                />
              ))}
            </div>
          )}

          {/* ── No-agents empty state ───────────────────────────────────── */}
          {agents.length === 0 && !showForm && (
            <div style={{
              textAlign:  "center",
              marginTop:  28,
              padding:    "32px 24px",
              border:     `1px solid ${P.border}`,
              background: P.muted,
            }}>
              <div style={{
                fontFamily:    "var(--font-pixel, monospace)",
                fontSize:      8,
                color:         P.sub,
                letterSpacing: "0.15em",
                lineHeight:    2,
                marginBottom:  14,
              }}>
                NO AGENTS YET
              </div>
              <div style={{
                fontFamily:   "system-ui, -apple-system, sans-serif",
                fontSize:     13,
                color:        P.dim,
                marginBottom: 20,
              }}>
                Build your first {dept.label.toLowerCase()} agent to populate the office.
              </div>
              <button
                onClick={() => setShowForm(true)}
                style={{
                  fontFamily:    "var(--font-pixel, monospace)",
                  fontSize:      7,
                  color:         "#080812",
                  background:    dept.color,
                  border:        "none",
                  padding:       "12px 20px",
                  cursor:        "pointer",
                  letterSpacing: "0.1em",
                }}
              >
                + BUILD FIRST AGENT
              </button>
            </div>
          )}

          {/* Floor strip */}
          <div
            aria-hidden="true"
            style={{
              marginTop:  24,
              height:     8,
              background: `repeating-linear-gradient(
                90deg,
                ${P.dim}    0px, ${P.dim}    23px,
                ${P.border} 23px, ${P.border} 24px
              )`,
            }}
          />
        </main>
      </div>
    </>
  );
}
