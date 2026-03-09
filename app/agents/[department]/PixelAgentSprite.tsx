"use client";

/**
 * app/agents/[department]/PixelAgentSprite.tsx
 * Tiny pixel-art person rendered as SVG.
 *
 * WORKING → sprite bobs gently + three square "thought" dots float above
 * IDLE    → static, full opacity
 * OFF     → static, dimmed
 *
 * All animations are driven by CSS keyframes defined in DepartmentClient.tsx's
 * injected <style> tag (which is always mounted before this component).
 * They are automatically suppressed by @media (prefers-reduced-motion: reduce).
 */

import type { AgentStatus } from "./agentStatus";

interface Props {
  status: AgentStatus;
  color:  string; // dept accent colour (body + hair)
  dark:   string; // dept dark colour  (legs + outlines)
}

export default function PixelAgentSprite({ status, color, dark }: Props) {
  const isWorking = status === "WORKING";
  const isOff     = status === "OFF";

  return (
    <div style={{ position: "relative", display: "inline-block" }}>

      {/* ── Thinking dots (WORKING only) ──────────────────────────────────── */}
      {isWorking && (
        <div
          aria-hidden="true"
          style={{
            position:      "absolute",
            top:           -30,
            right:         -2,
            display:       "flex",
            flexDirection: "column-reverse", // largest dot at bottom → diagonal rises
            alignItems:    "flex-end",
            gap:           4,
            pointerEvents: "none",
          }}
        >
          {([
            { size: 4, delay: "0s"    },
            { size: 6, delay: "0.18s" },
            { size: 9, delay: "0.36s" },
          ] as const).map(({ size, delay }, i) => (
            <div
              key={i}
              style={{
                width:          size,
                height:         size,
                background:     "rgba(230,230,255,0.92)",
                imageRendering: "pixelated",
                // square pixel dots — no border-radius
                animation:      `think-bubble 1.5s ${delay} ease-in-out infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* ── Pixel person SVG ──────────────────────────────────────────────── */}
      {/*
          viewBox 16×28 — each "pixel" = 3 CSS px at the rendered 48×84 size.
          Layout (in viewBox units):
            Head   : x=5  y=0  w=6 h=6
            Body   : x=4  y=7  w=8 h=10
            L arm  : x=1  y=7  w=3 h=8
            R arm  : x=12 y=7  w=3 h=8
            L leg  : x=4  y=18 w=3 h=9
            R leg  : x=9  y=18 w=3 h=9
      */}
      <svg
        viewBox="0 0 16 28"
        width={48}
        height={84}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          imageRendering: "pixelated",
          display:        "block",
          opacity:        isOff ? 0.38 : 1,
          animation:      isWorking ? "sprite-bob 2.2s ease-in-out infinite" : "none",
        }}
        aria-hidden="true"
      >
        {/* Hair */}
        <rect x={5}  y={0}  width={6} height={2} fill={dark} />
        {/* Head */}
        <rect x={5}  y={1}  width={6} height={5} fill="#F2C9A0" />
        {/* Eyes */}
        <rect x={6}  y={3}  width={1} height={1} fill="#2A2A48" />
        <rect x={9}  y={3}  width={1} height={1} fill="#2A2A48" />
        {/* Body */}
        <rect x={4}  y={7}  width={8} height={10} fill={color} />
        {/* Shirt collar highlight */}
        <rect x={6}  y={7}  width={4} height={2}  fill="rgba(255,255,255,0.22)" />
        {/* Left arm */}
        <rect x={1}  y={7}  width={3} height={8}  fill={color} />
        {/* Right arm */}
        <rect x={12} y={7}  width={3} height={8}  fill={color} />
        {/* Left hand */}
        <rect x={1}  y={14} width={3} height={2}  fill="#F2C9A0" />
        {/* Right hand */}
        <rect x={12} y={14} width={3} height={2}  fill="#F2C9A0" />
        {/* Left leg */}
        <rect x={4}  y={18} width={3} height={9}  fill={dark} />
        {/* Right leg */}
        <rect x={9}  y={18} width={3} height={9}  fill={dark} />
        {/* Left foot */}
        <rect x={3}  y={25} width={4} height={2}  fill="#1E1E3C" />
        {/* Right foot */}
        <rect x={9}  y={25} width={4} height={2}  fill="#1E1E3C" />
      </svg>
    </div>
  );
}
