"use client";

/**
 * app/agents/[department]/Workstation.tsx
 * Single pixel-art workstation inside the office room.
 *
 * Contains:
 *  - PixelAgentSprite (animated if WORKING)
 *  - Pixel desk + monitor SVG
 *  - Status badge (WORKING / IDLE / OFF) with optional LIVE micro-label
 *  - Last-active timestamp
 *  - Message preview snippet
 *  - Presence task note (from heartbeat)
 *  - CHAT and SETTINGS action buttons
 *
 * forceWorking=true overrides the message-recency status heuristic to WORKING.
 * presenceLive=true drives the LIVE badge (only when heartbeat ≤ 10 s).
 *
 * Walk animation:
 *  - When forceWorking flips false→true, the sprite "walks" to the desk via
 *    a CSS translateY with steps() timing (pixel-art feel).
 *  - When true→false, it walks back to the standing position.
 *  - Suppressed automatically by prefers-reduced-motion (global rule in
 *    DepartmentClient's <style> tag).
 *
 * Note grace window:
 *  - When a presence note clears, the message preview is restored after 1 s
 *    to avoid a jarring visual swap.
 *
 * Renders an "EMPTY DESK" state when agent prop is null.
 */

import { useState, useEffect, useRef } from "react";
import Link              from "next/link";
import PixelAgentSprite  from "./PixelAgentSprite";
import {
  computeStatus,
  formatLastActive,
  STATUS_COLOR,
}                        from "./agentStatus";
import type { AgentWithActivity } from "./DepartmentClient";
import type { Department }        from "@/lib/departments";

/* ─── Palette ─────────────────────────────────────────────────────────────── */

const P = {
  border: "#1E1E40",
  fg:     "#E2E2FF",
  sub:    "#6868A0",
  dim:    "#2A2A4A",
};

/* ─── Pixel desk + monitor SVG ───────────────────────────────────────────── */

function PixelDesk({
  color,
  isWorking,
}: {
  color:     string;
  isWorking: boolean;
}) {
  return (
    <svg
      viewBox="0 0 48 22"
      width={144}
      height={66}
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated", display: "block" }}
      aria-hidden="true"
    >
      {/* Monitor casing */}
      <rect x={14} y={0}  width={20} height={13} fill={color}     opacity={0.85} />
      {/* Screen bezel */}
      <rect x={15} y={1}  width={18} height={11} fill="#060610" />
      {/* Screen content glow — pulses gently when WORKING */}
      <rect
        x={16} y={2} width={16} height={9}
        fill={color}
        opacity={0.18}
        className={isWorking ? "monitor-glow-active" : ""}
      />
      {/* Scanline on screen */}
      <rect x={16} y={5}  width={16} height={1}  fill={color}     opacity={0.12} />
      <rect x={16} y={8}  width={16} height={1}  fill={color}     opacity={0.12} />
      {/* Blinking cursor — only when WORKING */}
      {isWorking && (
        <rect
          x={17} y={9} width={3} height={1}
          fill={color}
          style={{ animation: "blink-cursor 0.9s step-end infinite" }}
        />
      )}
      {/* Monitor stand */}
      <rect x={22} y={13} width={4}  height={3}  fill={color}     opacity={0.65} />
      {/* Desk surface */}
      <rect x={0}  y={16} width={48} height={3}  fill={color}     opacity={0.50} />
      <rect x={0}  y={18} width={48} height={3}  fill={color}     opacity={0.28} />
      {/* Keyboard */}
      <rect x={14} y={17} width={16} height={2}  fill="#0E0E28" />
      <rect x={15} y={17} width={14} height={1}  fill="#16163A" />
      {/* Mouse */}
      <rect x={32} y={17} width={4}  height={3}  fill="#0E0E28" />
      {/* Desk legs */}
      <rect x={2}  y={20} width={3}  height={2}  fill={color}     opacity={0.35} />
      <rect x={43} y={20} width={3}  height={2}  fill={color}     opacity={0.35} />
    </svg>
  );
}

/* ─── Empty station ──────────────────────────────────────────────────────── */

function EmptyStation({ index }: { index: number }) {
  return (
    <div
      aria-label={`Workstation ${index + 1} — empty`}
      style={{
        flex:          1,
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        justifyContent:"center",
        padding:       "20px 12px 24px",
        gap:           10,
        opacity:       0.38,
      }}
    >
      {/* Pixel chair SVG */}
      <svg
        viewBox="0 0 18 22"
        width={54}
        height={66}
        xmlns="http://www.w3.org/2000/svg"
        style={{ imageRendering: "pixelated", display: "block", marginBottom: 8 }}
        aria-hidden="true"
      >
        {/* Chair back */}
        <rect x={2}  y={0}  width={14} height={9}  fill="#14142E" />
        <rect x={3}  y={1}  width={12} height={7}  fill="#1A1A38" />
        {/* Chair seat */}
        <rect x={0}  y={10} width={18} height={4}  fill="#1A1A38" />
        <rect x={1}  y={11} width={16} height={2}  fill="#1E1E42" />
        {/* Chair legs */}
        <rect x={1}  y={14} width={2}  height={8}  fill="#12122A" />
        <rect x={15} y={14} width={2}  height={8}  fill="#12122A" />
        {/* Crossbar */}
        <rect x={4}  y={16} width={10} height={2}  fill="#12122A" />
      </svg>

      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      7,
        color:         P.dim,
        letterSpacing: "0.15em",
      }}>
        EMPTY DESK
      </div>
      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      5,
        color:         "#18183A",
        letterSpacing: "0.12em",
      }}>
        STATION {index + 1}
      </div>
    </div>
  );
}

/* ─── Occupied station ───────────────────────────────────────────────────── */

interface Props {
  agent:         AgentWithActivity | null;
  dept:          Department;
  index:         number;
  /** When true, overrides the message-recency status to WORKING (live presence). */
  forceWorking?: boolean;
  /** When true, the heartbeat is genuinely fresh (≤ 10 s) → show LIVE badge. */
  presenceLive?: boolean;
  /** Short task note from the presence heartbeat (e.g. "Responding..."). */
  note?:         string;
}

export default function Workstation({
  agent,
  dept,
  index,
  forceWorking  = false,
  presenceLive  = false,
  note          = "",
}: Props) {
  if (!agent) return <EmptyStation index={index} />;

  const baseStatus  = computeStatus(agent.lastActive);
  // Presence signal overrides the message-recency heuristic
  const status      = forceWorking ? "WORKING" : baseStatus;
  // Show LIVE badge only when heartbeat is genuinely fresh (≤ 10 s)
  const isLive      = forceWorking && presenceLive;
  const lastActive  = formatLastActive(agent.lastActive);
  const isWorking   = status === "WORKING";
  const statusColor = STATUS_COLOR[status];

  // Truncate note to 32 chars for display; full note exposed via title tooltip
  const truncNote = note.length > 32 ? `${note.slice(0, 32)}…` : note;

  // ── Walk animation ──────────────────────────────────────────────────────
  // Detect forceWorking transitions and enable the CSS transition class for
  // 500 ms. The .sprite-pos-walking class adds `transition: transform 0.45s
  // steps(6, end)` which is defined in DepartmentClient's <style> tag.
  const prevForceWorkingRef = useRef(forceWorking);
  const [isWalking, setIsWalking] = useState(false);

  useEffect(() => {
    if (prevForceWorkingRef.current !== forceWorking) {
      prevForceWorkingRef.current = forceWorking;
      setIsWalking(true);
      const t = setTimeout(() => setIsWalking(false), 500);
      return () => clearTimeout(t);
    }
  }, [forceWorking]);

  const spriteClasses = [
    "sprite-pos-" + (forceWorking ? "desk" : "standing"),
    isWalking ? "sprite-pos-walking" : "",
  ].filter(Boolean).join(" ");

  // ── Note grace window ────────────────────────────────────────────────────
  // When the presence note clears (streaming ended), delay restoring the
  // message preview by 1 s to avoid a jarring visual swap.
  const noteTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPreview, setShowPreview] = useState(!truncNote);

  useEffect(() => {
    if (noteTimerRef.current) {
      clearTimeout(noteTimerRef.current);
      noteTimerRef.current = null;
    }
    if (truncNote) {
      // Note appeared → hide preview immediately
      setShowPreview(false);
    } else {
      // Note cleared → restore preview after grace period
      noteTimerRef.current = setTimeout(() => setShowPreview(true), 1_000);
    }
    return () => {
      if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    };
  }, [truncNote]);

  return (
    <div
      style={{
        flex:          1,
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        padding:       "16px 10px 20px",
        gap:           2,
        position:      "relative",
        minWidth:      0,
      }}
    >
      {/* ── Status badge (top-right corner) ────────────────────────────── */}
      <div
        aria-label={`Status: ${status}${isLive ? " (live presence)" : ""}`}
        style={{
          position:      "absolute",
          top:           8,
          right:         8,
          display:       "flex",
          alignItems:    "center",
          gap:           4,
          fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
          fontSize:      5,
          color:         statusColor,
          letterSpacing: "0.12em",
        }}
      >
        {/* Pixel indicator light */}
        <span
          aria-hidden="true"
          style={{
            display:        "inline-block",
            width:          6,
            height:         6,
            background:     statusColor,
            imageRendering: "pixelated",
            animation:      isWorking ? "status-pulse 1.1s ease-in-out infinite" : "none",
          }}
        />
        {status}
        {/* LIVE micro-label — only when heartbeat is genuinely fresh (≤ 10 s) */}
        {isLive && (
          <span
            aria-hidden="true"
            style={{
              marginLeft:    3,
              fontSize:      4,
              color:         "rgba(85,239,196,1)",
              letterSpacing: "0.12em",
              animation:     "live-pulse 1s ease-in-out infinite",
            }}
          >
            LIVE
          </span>
        )}
      </div>

      {/* ── Agent sprite (walk-to-desk position class) ───────────────────── */}
      <div className={spriteClasses} style={{ marginTop: 12 }}>
        <PixelAgentSprite
          status={status}
          color={dept.color}
          dark={dept.dark}
        />
      </div>

      {/* ── Pixel desk ──────────────────────────────────────────────────── */}
      <PixelDesk color={dept.color} isWorking={isWorking} />

      {/* ── Agent name ──────────────────────────────────────────────────── */}
      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      7,
        color:         dept.color,
        letterSpacing: "0.05em",
        textAlign:     "center",
        lineHeight:    1.5,
        marginTop:     8,
        maxWidth:      "95%",
        overflow:      "hidden",
        textOverflow:  "ellipsis",
        whiteSpace:    "nowrap",
        textShadow:    `0 0 8px ${dept.glow}`,
      }}>
        {agent.name}
      </div>

      {/* ── Last active ─────────────────────────────────────────────────── */}
      <div style={{
        fontFamily: "monospace",
        fontSize:   10,
        color:      agent.lastActive ? statusColor : P.dim,
        textAlign:  "center",
        opacity:    0.9,
        marginTop:  2,
      }}>
        {agent.lastActive ? `Last active: ${lastActive}` : lastActive}
      </div>

      {/* ── Presence task note (when agent is live) ──────────────────────── */}
      {truncNote && (
        <div
          title={note}
          style={{
            fontFamily:   "monospace",
            fontSize:     9,
            color:        "rgba(85,239,196,0.75)",
            textAlign:    "center",
            overflow:     "hidden",
            whiteSpace:   "nowrap",
            textOverflow: "ellipsis",
            maxWidth:     "92%",
            marginTop:    1,
            fontStyle:    "italic",
          }}
        >
          ↳ {truncNote}
        </div>
      )}

      {/* ── Message preview (hidden while note active; 1 s grace after clear) */}
      {agent.lastPreview && showPreview && (
        <div style={{
          fontFamily:   "monospace",
          fontSize:     9,
          color:        P.sub,
          textAlign:    "center",
          overflow:     "hidden",
          whiteSpace:   "nowrap",
          textOverflow: "ellipsis",
          maxWidth:     "92%",
          opacity:      0.65,
          marginTop:    1,
          fontStyle:    "italic",
        }}>
          &ldquo;{agent.lastPreview}{agent.lastPreview.length >= 60 ? "…" : ""}&rdquo;
        </div>
      )}

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <Link
          href={`/agents/${dept.id}/${agent.id}`}
          aria-label={`Chat with ${agent.name}`}
          style={{
            fontFamily:     "var(--font-pixel, 'Courier New', monospace)",
            fontSize:       6,
            color:          "#080812",
            background:     dept.color,
            textDecoration: "none",
            padding:        "7px 14px",
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
            fontSize:       6,
            color:          P.sub,
            border:         `1px solid ${P.border}`,
            textDecoration: "none",
            padding:        "7px 10px",
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
