"use client";

/**
 * app/agents/PixelOfficeHub.tsx
 * Pixel-art office hub — 6 department buildings in a 2×3 grid.
 * Clicking a building routes to /agents/[department].
 * Shows a live agent-count badge per building fetched from /api/agents.
 */

import { useState, useEffect } from "react";
import { useRouter }           from "next/navigation";
import Link                    from "next/link";
import { DEPARTMENTS }         from "@/lib/departments";
import type { Department }     from "@/lib/departments";

/* ─── Colour palette ──────────────────────────────────────────────────────── */

const P = {
  bg:     "#080812",
  card:   "#10102A",
  border: "#242440",
  fg:     "#E2E2FF",
  sub:    "#6868A0",
  dim:    "#353560",
  floor:  "#0E0E22",
};

/* ─── Pixel building SVG ──────────────────────────────────────────────────── */

function PixelBuilding({ color, dark }: { color: string; dark: string }) {
  const win  = "#C8DFFF";
  const winD = "#445570";
  return (
    <svg
      viewBox="0 0 16 26"
      width={80}
      height={130}
      xmlns="http://www.w3.org/2000/svg"
      style={{ imageRendering: "pixelated", display: "block" }}
      aria-hidden="true"
    >
      {/* Antenna */}
      <rect x={7}  y={0} width={2} height={4} fill={dark} />
      <rect x={5}  y={1} width={6} height={2} fill={dark} />
      {/* Roof */}
      <rect x={0}  y={4} width={16} height={2} fill={dark} />
      {/* Body */}
      <rect x={0}  y={6} width={16} height={16} fill={color} />
      {/* Shadow right */}
      <rect x={14} y={6} width={2} height={16} fill="rgba(0,0,0,0.28)" />
      {/* Windows row 1 */}
      <rect x={1}  y={7}  width={3} height={2} fill={win}  />
      <rect x={6}  y={7}  width={3} height={2} fill={win}  />
      <rect x={11} y={7}  width={3} height={2} fill={win}  />
      {/* Windows row 2 */}
      <rect x={1}  y={11} width={3} height={2} fill={winD} />
      <rect x={6}  y={11} width={3} height={2} fill={win}  />
      <rect x={11} y={11} width={3} height={2} fill={winD} />
      {/* Windows row 3 */}
      <rect x={1}  y={15} width={3} height={2} fill={win}  />
      <rect x={6}  y={15} width={3} height={2} fill={winD} />
      <rect x={11} y={15} width={3} height={2} fill={win}  />
      {/* Door */}
      <rect x={6}  y={18} width={4} height={4} fill="#080812" />
      <rect x={9}  y={20} width={1} height={1} fill={dark} />
      {/* Steps */}
      <rect x={0}  y={22} width={16} height={2} fill={dark} />
      <rect x={2}  y={24} width={12} height={2} fill={dark} opacity={0.65} />
    </svg>
  );
}

/* ─── Building card ───────────────────────────────────────────────────────── */

function OfficeBuildingCard({
  dept,
  count,
  onClick,
}: {
  dept:    Department;
  count:   number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`${dept.label} — ${dept.tagline}. ${count} agent${count !== 1 ? "s" : ""}. Click to enter.`}
      style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           8,
        padding:       "20px 12px 14px",
        background:    hovered ? P.card : "transparent",
        border:        `2px solid ${hovered ? dept.color : P.border}`,
        borderRadius:  0,
        cursor:        "pointer",
        boxShadow:     hovered ? `0 0 28px ${dept.glow}` : "none",
        transform:     hovered ? "translateY(-6px)" : "translateY(0)",
        transition:    "transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease, background 0.12s ease",
        width:         "100%",
        position:      "relative",
      }}
    >
      {/* Agent count badge — shown when > 0 */}
      {count > 0 && (
        <div style={{
          position:      "absolute",
          top:           8,
          right:         8,
          fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
          fontSize:      6,
          color:         P.bg,
          background:    dept.color,
          padding:       "2px 6px",
          letterSpacing: "0.1em",
        }}>
          {count}
        </div>
      )}

      {/* Building graphic */}
      <div style={{
        filter:     hovered ? `drop-shadow(0 0 10px ${dept.color})` : "none",
        transition: "filter 0.12s ease",
      }}>
        <PixelBuilding color={dept.color} dark={dept.dark} />
      </div>

      {/* Emoji */}
      <div style={{ fontSize: 18, lineHeight: 1 }} aria-hidden="true">
        {dept.emoji}
      </div>

      {/* Department name */}
      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      8,
        color:         hovered ? dept.color : P.fg,
        letterSpacing: "0.05em",
        textAlign:     "center",
        lineHeight:    1.6,
        transition:    "color 0.12s",
      }}>
        {dept.label}
      </div>

      {/* Tagline */}
      <div style={{
        fontFamily: "monospace",
        fontSize:   10,
        color:      P.sub,
        textAlign:  "center",
      }}>
        {dept.tagline}
      </div>

      {/* Agent count chip */}
      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      6,
        color:         count > 0 ? dept.color : P.dim,
        border:        `1px solid ${count > 0 ? dept.color : P.border}`,
        padding:       "3px 7px",
        letterSpacing: "0.12em",
        opacity:       count > 0 ? 0.9 : 0.7,
        transition:    "color 0.12s, border-color 0.12s",
      }}>
        {count > 0 ? `${count} AGENT${count !== 1 ? "S" : ""}` : "EMPTY"}
      </div>
    </button>
  );
}

/* ─── Main hub ────────────────────────────────────────────────────────────── */

export default function PixelOfficeHub() {
  const router = useRouter();

  const [agentCounts, setAgentCounts] = useState<Record<string, number>>({});

  // Fetch all agents on mount; group by department for count badges
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d: { agents?: { department: string }[] }) => {
        const counts: Record<string, number> = {};
        for (const a of d.agents ?? []) {
          if (a.department) {
            counts[a.department] = (counts[a.department] ?? 0) + 1;
          }
        }
        setAgentCounts(counts);
      })
      .catch(() => {});
  }, []);

  const totalAgents = Object.values(agentCounts).reduce((s, n) => s + n, 0);

  return (
    <>
      {/* ── Injected styles ─────────────────────────────────────────────── */}
      <style>{`
        @keyframes pixel-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes scanlines-scroll {
          from { background-position: 0 0; }
          to   { background-position: 0 4px; }
        }
        .agent-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 2px;
        }
        @media (max-width: 520px) {
          .agent-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (prefers-reduced-motion: reduce) {
          .scanline-layer { display: none !important; }
          * { transition: none !important; transform: none !important; }
        }
      `}</style>

      <div style={{
        minHeight:  "100vh",
        background: `
          radial-gradient(ellipse at 20% 15%, rgba(162,155,254,0.07) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 25%, rgba(85,239,196,0.05) 0%, transparent 40%),
          ${P.bg}
        `,
        color:     P.fg,
        position:  "relative",
        overflowX: "hidden",
      }}>

        {/* Scanline overlay */}
        <div
          className="scanline-layer"
          aria-hidden="true"
          style={{
            position:        "fixed",
            inset:           0,
            zIndex:          10,
            pointerEvents:   "none",
            backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px)",
            animation:       "scanlines-scroll 0.3s linear infinite",
          }}
        />

        {/* ── Header ──────────────────────────────────────────────────── */}
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
            href="/officebuilding"
            style={{
              fontFamily:     "var(--font-pixel, 'Courier New', monospace)",
              fontSize:       7,
              color:          P.sub,
              textDecoration: "none",
              border:         `1px solid ${P.border}`,
              padding:        "5px 9px",
              letterSpacing:  "0.12em",
              whiteSpace:     "nowrap",
            }}
          >
            ← BACK
          </Link>

          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
              fontSize:      10,
              color:         P.fg,
              letterSpacing: "0.06em",
              lineHeight:    1.4,
            }}>
              AGENT OFFICE
            </div>
            <div style={{
              fontFamily: "monospace",
              fontSize:   11,
              color:      P.sub,
              marginTop:  4,
            }}>
              Select a department to manage agents
            </div>
          </div>

          <div style={{
            fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
            fontSize:      6,
            color:         P.dim,
            letterSpacing: "0.15em",
            textAlign:     "right",
            lineHeight:    2,
          }}>
            {DEPARTMENTS.length} DEPTS
            <br />
            <span style={{ color: "rgba(85,239,196,0.7)" }}>
              {totalAgents > 0
                ? `${totalAgents} AGENT${totalAgents !== 1 ? "S" : ""}`
                : "● ONLINE"}
            </span>
          </div>
        </header>

        {/* ── Scene ───────────────────────────────────────────────────── */}
        <main
          id="main-content"
          style={{ padding: "40px 24px 80px", maxWidth: 760, margin: "0 auto" }}
        >
          {/* Title block */}
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{
              fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
              fontSize:      9,
              color:         P.sub,
              letterSpacing: "0.3em",
              marginBottom:  12,
            }}>
              ▸ WELCOME TO THE ◂
            </div>

            <div style={{
              fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
              fontSize:      18,
              color:         P.fg,
              letterSpacing: "0.08em",
              lineHeight:    1.5,
              textShadow:    "0 0 24px rgba(162,155,254,0.45)",
            }}>
              AGENT OFFICE
              <span
                aria-hidden="true"
                style={{
                  display:       "inline-block",
                  width:         "0.6em",
                  background:    P.fg,
                  marginLeft:    4,
                  animation:     "pixel-blink 1.1s step-end infinite",
                  verticalAlign: "middle",
                  height:        "1em",
                }}
              />
            </div>

            <div style={{
              fontFamily:    "monospace",
              fontSize:      12,
              color:         P.sub,
              marginTop:     12,
              letterSpacing: "0.06em",
            }}>
              6 departments · click a building to enter
            </div>
          </div>

          {/* Star field */}
          <div
            aria-hidden="true"
            style={{
              position:      "relative",
              height:        20,
              marginBottom:  8,
              overflow:      "hidden",
              pointerEvents: "none",
            }}
          >
            {["6%","14%","28%","42%","55%","68%","78%","90%"].map((l, i) => (
              <div
                key={i}
                style={{
                  position:       "absolute",
                  left:           l,
                  top:            `${[40, 20, 60, 10, 50, 30, 70, 15][i]}%`,
                  width:          2,
                  height:         2,
                  background:     i % 3 === 0 ? "rgba(162,155,254,0.6)" : "rgba(255,255,255,0.3)",
                  imageRendering: "pixelated",
                }}
              />
            ))}
          </div>

          {/* Building grid */}
          <div
            className="agent-grid"
            role="list"
            aria-label="Department buildings"
          >
            {DEPARTMENTS.map((dept) => (
              <div key={dept.id} role="listitem">
                <OfficeBuildingCard
                  dept={dept}
                  count={agentCounts[dept.id] ?? 0}
                  onClick={() => router.push(`/agents/${dept.id}`)}
                />
              </div>
            ))}
          </div>

          {/* Pixel ground */}
          <div aria-hidden="true" style={{
            marginTop:  0,
            height:     8,
            background: `repeating-linear-gradient(
              90deg,
              ${P.floor}  0px, ${P.floor}  15px,
              ${P.border} 15px, ${P.border} 16px
            )`,
          }} />
          <div aria-hidden="true" style={{
            height:   4,
            background: `repeating-linear-gradient(
              90deg,
              ${P.dim}    0px, ${P.dim}    15px,
              transparent 15px, transparent 16px
            )`,
            opacity: 0.5,
          }} />

          {/* Bottom hint */}
          <div style={{
            marginTop:     40,
            textAlign:     "center",
            fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
            fontSize:      7,
            color:         P.dim,
            letterSpacing: "0.2em",
            lineHeight:    2.2,
          }}>
            HOVER TO PREVIEW · CLICK TO ENTER
          </div>

          {/* Action links */}
          <div style={{ marginTop: 24, display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <Link
              href="/agents/new"
              style={{
                fontFamily:     "var(--font-pixel, 'Courier New', monospace)",
                fontSize:       7,
                color:          "#A29BFE",
                textDecoration: "none",
                border:         "1px solid #6C5CE7",
                background:     "rgba(108,92,231,0.15)",
                padding:        "8px 14px",
                letterSpacing:  "0.12em",
                display:        "inline-block",
              }}
            >
              + BUILD NEW AGENT
            </Link>
            <Link
              href="/agents/list"
              style={{
                fontFamily:     "var(--font-pixel, 'Courier New', monospace)",
                fontSize:       7,
                color:          P.sub,
                textDecoration: "none",
                border:         `1px solid ${P.border}`,
                padding:        "8px 14px",
                letterSpacing:  "0.12em",
                display:        "inline-block",
              }}
            >
              ☰ MANAGE ALL AGENTS →
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
