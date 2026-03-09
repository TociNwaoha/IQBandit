"use client";

/**
 * app/agents/[department]/PixelOfficeRoom.tsx
 * Pixel-art office room scene — back wall, window, lamp, two workstations.
 *
 * Visual layout:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │ [WINDOW]     [DEPT SIGN • COUNT]       [LAMP]  │ ← back wall
 *   │                                                 │
 *   │  ╔══════════════╗    ╔══════════════╗          │
 *   │  ║  Workstation  ║    ║  Workstation  ║         │
 *   │  ║      0        ║    ║      1        ║         │
 *   │  ╚══════════════╝    ╚══════════════╝          │
 *   │═════════════════════════════════════════════════│ ← floor
 *   └──────────────────────────────────────────────────────┘
 *
 * Ambience (CSS-only, respects prefers-reduced-motion):
 *   - Monitor screen glow pulses gently when agent is WORKING
 *   - Floor lamp shade flickers occasionally when any agent is live
 *   - 3 dust mote pixels drift near the window
 */

import Workstation               from "./Workstation";
import type { AgentWithActivity } from "./DepartmentClient";
import type { Department }        from "@/lib/departments";

/* ─── Pixel city window (back wall) ──────────────────────────────────────── */

function PixelWindow() {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <svg
        viewBox="0 0 32 28"
        width={64}
        height={56}
        xmlns="http://www.w3.org/2000/svg"
        style={{ imageRendering: "pixelated", display: "block" }}
        aria-hidden="true"
      >
        {/* Window frame */}
        <rect x={0} y={0}  width={32} height={28} fill="#14143A" />
        {/* Glass sky — deep night */}
        <rect x={2} y={2}  width={28} height={24} fill="#080C20" />
        {/* Sky tones */}
        <rect x={2} y={2}  width={28} height={6}  fill="#0A1030" />
        {/* Stars */}
        <rect x={4}  y={3}  width={1} height={1} fill="rgba(210,220,255,0.75)" />
        <rect x={12} y={2}  width={1} height={1} fill="rgba(210,220,255,0.55)" />
        <rect x={22} y={4}  width={1} height={1} fill="rgba(210,220,255,0.70)" />
        <rect x={9}  y={6}  width={1} height={1} fill="rgba(210,220,255,0.40)" />
        <rect x={27} y={3}  width={1} height={1} fill="rgba(210,220,255,0.60)" />
        {/* City silhouette */}
        <rect x={2}  y={14} width={4}  height={12} fill="#050516" />
        <rect x={7}  y={11} width={3}  height={15} fill="#060518" />
        <rect x={11} y={16} width={5}  height={10} fill="#050516" />
        <rect x={17} y={12} width={4}  height={14} fill="#060518" />
        <rect x={22} y={15} width={4}  height={11} fill="#050516" />
        <rect x={27} y={13} width={3}  height={13} fill="#060518" />
        {/* Building windows (lit yellow) */}
        <rect x={8}  y={12} width={1} height={1} fill="rgba(255,220,100,0.7)" />
        <rect x={18} y={13} width={1} height={1} fill="rgba(255,220,100,0.6)" />
        <rect x={24} y={16} width={1} height={1} fill="rgba(255,220,100,0.5)" />
        <rect x={28} y={15} width={1} height={1} fill="rgba(255,220,100,0.6)" />
        {/* Window cross bars */}
        <rect x={0}  y={13} width={32} height={2}  fill="#14143A" />
        <rect x={15} y={0}  width={2}  height={28} fill="#14143A" />
      </svg>

      {/* Dust mote particles — 3 tiny squares drifting near the window.
          Animations defined in DepartmentClient's <style> tag.
          aria-hidden: purely decorative. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top:      8,
          left:     6,
          width:    1,
          height:   1,
          background: "rgba(200,210,255,0.6)",
          imageRendering: "pixelated",
          animation: "dust-drift-a 7s 0s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top:      14,
          left:     22,
          width:    1,
          height:   1,
          background: "rgba(200,210,255,0.5)",
          imageRendering: "pixelated",
          animation: "dust-drift-b 9s 2.5s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top:      20,
          left:     40,
          width:    1,
          height:   1,
          background: "rgba(200,210,255,0.45)",
          imageRendering: "pixelated",
          animation: "dust-drift-c 11s 5s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

/* ─── Pixel floor lamp ───────────────────────────────────────────────────── */

function PixelLamp({ color, isLive }: { color: string; isLive: boolean }) {
  return (
    <svg
      viewBox="0 0 10 36"
      width={20}
      height={72}
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated", flexShrink: 0, alignSelf: "flex-end" }}
      aria-hidden="true"
    >
      {/* Shade — flickers when any agent is live */}
      <rect
        x={0} y={0} width={10} height={5}
        fill={color}
        opacity={0.92}
        className={isLive ? "lamp-shade-live" : ""}
      />
      <rect x={1} y={5}  width={8}  height={2}  fill={color} opacity={0.70} />
      {/* Glow spill */}
      <rect x={2} y={7}  width={6}  height={1}  fill={color} opacity={0.25} />
      {/* Pole */}
      <rect x={4} y={8}  width={2}  height={22} fill="#1A1A3C" />
      {/* Base */}
      <rect x={2} y={30} width={6}  height={3}  fill="#1A1A3C" />
      <rect x={1} y={33} width={8}  height={3}  fill="#141430" />
    </svg>
  );
}

/* ─── Pixel desk + monitor (used inside Workstation, duplicated here for
       the monitor-glow animation class) ─────────────────────────────────── */
// Note: PixelDesk lives in Workstation.tsx; we extend Workstation's props
// through forceWorking so the monitor glow is driven by presence there.

/* ─── Office room ────────────────────────────────────────────────────────── */

interface PresenceInfo {
  isWorking:      boolean;
  displayNote:    string;
  presenceStatus: "live" | "stale" | "offline";
  activity:       string;
}

interface Props {
  dept:        Department;
  agents:      [AgentWithActivity | null, AgentWithActivity | null];
  presenceMap: Record<string, PresenceInfo>;
  agentCount:  number;
}

export default function PixelOfficeRoom({ dept, agents, presenceMap, agentCount }: Props) {
  // Determine if any desk agent is live+working (drives lamp flicker + monitor glow)
  const anyLiveWorking = agents.some(
    (a) => a && presenceMap[a.id]?.isWorking && presenceMap[a.id]?.presenceStatus === "live",
  );

  return (
    <div
      role="region"
      aria-label={`${dept.label} department office room`}
      style={{
        position:  "relative",
        overflow:  "hidden",
        border:    `1px solid ${dept.color}28`,
        boxShadow: `0 0 48px ${dept.glow}, inset 0 0 80px rgba(0,0,0,0.35)`,
      }}
    >

      {/* CRT scanline overlay */}
      <div
        aria-hidden="true"
        className="scanline-layer"
        style={{
          position:        "absolute",
          inset:           0,
          zIndex:          8,
          pointerEvents:   "none",
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.055) 3px, rgba(0,0,0,0.055) 4px)",
          animation:       "scanlines-scroll 0.3s linear infinite",
        }}
      />

      {/* ── Back wall ─────────────────────────────────────────────────────── */}
      <div style={{
        background: "#11112A",
        padding:    "14px 20px 0",
        display:    "flex",
        alignItems: "flex-end",
        gap:        12,
        position:   "relative",
        zIndex:     2,
        minHeight:  80,
      }}>
        {/* Left: night window with dust particles */}
        <PixelWindow />

        {/* Centre: department sign (shows label + agent count) */}
        <div style={{
          flex:          1,
          textAlign:     "center",
          paddingBottom: 10,
        }}>
          <div style={{
            display:       "inline-block",
            fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
            fontSize:      7,
            color:         dept.color,
            letterSpacing: "0.15em",
            textShadow:    `0 0 14px ${dept.glow}`,
            border:        `1px solid ${dept.color}44`,
            background:    "rgba(0,0,0,0.5)",
            padding:       "5px 12px",
          }}>
            {dept.emoji} {dept.label.toUpperCase()} OPS
            {agentCount > 0 && (
              <span style={{ opacity: 0.6 }}> • {agentCount}</span>
            )}
          </div>
        </div>

        {/* Right: floor lamp — flickers when any agent is live */}
        <PixelLamp color={dept.color} isLive={anyLiveWorking} />
      </div>

      {/* Wall / floor divider */}
      <div style={{
        height:     3,
        background: `linear-gradient(90deg, #0A0A18, ${dept.color}28, #0A0A18)`,
        position:   "relative",
        zIndex:     2,
      }} />

      {/* ── Workstations ──────────────────────────────────────────────────── */}
      <div
        className="workstation-row"
        style={{
          background: "#0A0A18",
          display:    "flex",
          position:   "relative",
          zIndex:     2,
        }}
      >
        {/* Left station */}
        <Workstation
          agent={agents[0]}
          dept={dept}
          index={0}
          forceWorking={!!(agents[0] && presenceMap[agents[0].id]?.isWorking)}
          presenceLive={!!(agents[0] && presenceMap[agents[0].id]?.presenceStatus === "live")}
          note={agents[0] ? (presenceMap[agents[0].id]?.displayNote ?? "") : ""}
        />

        {/* Vertical divider */}
        <div style={{
          width:      1,
          alignSelf:  "stretch",
          background: `linear-gradient(180deg, transparent, ${dept.color}30, transparent)`,
          flexShrink: 0,
        }} />

        {/* Right station */}
        <Workstation
          agent={agents[1]}
          dept={dept}
          index={1}
          forceWorking={!!(agents[1] && presenceMap[agents[1].id]?.isWorking)}
          presenceLive={!!(agents[1] && presenceMap[agents[1].id]?.presenceStatus === "live")}
          note={agents[1] ? (presenceMap[agents[1].id]?.displayNote ?? "") : ""}
        />
      </div>

      {/* ── Pixel floor tiles ─────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        style={{
          height:     18,
          background: `
            repeating-linear-gradient(
              90deg,
              rgba(255,255,255,0.018) 0px,
              rgba(255,255,255,0.018) 47px,
              rgba(255,255,255,0.045) 47px,
              rgba(255,255,255,0.045) 48px
            )`,
          borderTop:  `1px solid rgba(255,255,255,0.06)`,
          position:   "relative",
          zIndex:     2,
        }}
      />

      {/* Dept colour accent bar */}
      <div style={{
        height:     3,
        background: `linear-gradient(90deg, transparent, ${dept.color}, transparent)`,
        opacity:    0.45,
        position:   "relative",
        zIndex:     2,
      }} />
    </div>
  );
}
