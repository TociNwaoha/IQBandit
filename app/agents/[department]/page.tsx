/**
 * app/agents/[department]/page.tsx
 * Protected server page — "inside the building" department view.
 * Shows agents that belong to this department, sorted by last-active time.
 * Renders a pixel-art "not found" state for invalid department slugs.
 */

import Link                          from "next/link";
import { redirect }                  from "next/navigation";
import { getSessionFromCookies }     from "@/lib/auth";
import { Press_Start_2P }            from "next/font/google";
import { getDepartment }             from "@/lib/departments";
import { listAgentsByDepartment }    from "@/lib/agents";
import {
  getAgentsLastActivity,
}                                    from "@/lib/conversations";
import DepartmentClient              from "./DepartmentClient";
import type { AgentWithActivity }    from "./DepartmentClient";

const pixelFont = Press_Start_2P({
  weight:   "400",
  subsets:  ["latin"],
  variable: "--font-pixel",
});

/* ─── Pixel-art "not found" inline page ─────────────────────────────────── */

function DeptNotFound() {
  return (
    <div style={{
      minHeight:      "100vh",
      background:     "#080812",
      color:          "#E2E2FF",
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      gap:            20,
      textAlign:      "center",
      padding:        "0 24px",
    }}>
      <div style={{ fontSize: 52 }} aria-hidden="true">🏚</div>
      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      14,
        color:         "#E2E2FF",
        letterSpacing: "0.06em",
      }}>
        404
      </div>
      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      8,
        color:         "#6868A0",
        letterSpacing: "0.2em",
        lineHeight:    2,
      }}>
        DEPARTMENT NOT FOUND
      </div>
      <div style={{
        fontFamily: "monospace",
        fontSize:   13,
        color:      "#353560",
        maxWidth:   320,
        lineHeight: 1.6,
      }}>
        That department slug doesn&apos;t exist. Head back to the hub and choose a valid department.
      </div>
      <Link
        href="/agents"
        style={{
          fontFamily:     "var(--font-pixel, 'Courier New', monospace)",
          fontSize:       7,
          color:          "#6868A0",
          textDecoration: "none",
          border:         "1px solid #242440",
          padding:        "8px 14px",
          letterSpacing:  "0.12em",
          marginTop:      8,
        }}
      >
        ← BACK TO HUB
      </Link>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ department: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const { department } = await params;
  const dept           = getDepartment(department);

  // Invalid slug → render custom pixel-art 404 (no crash, no blank page)
  if (!dept) {
    return (
      <div className={pixelFont.variable}>
        <DeptNotFound />
      </div>
    );
  }

  const rawAgents  = listAgentsByDepartment(department);
  const activity   = getAgentsLastActivity(rawAgents.map((a) => a.id));

  // Merge activity metadata and sort by most-recently active first
  const agents: AgentWithActivity[] = rawAgents
    .map((a) => ({
      ...a,
      lastActive:  activity[a.id]?.lastActive,
      lastPreview: activity[a.id]?.preview,
    }))
    .sort((a, b) => {
      const aTime = a.lastActive ?? a.created_at;
      const bTime = b.lastActive ?? b.created_at;
      return bTime.localeCompare(aTime);
    });

  return (
    <div className={pixelFont.variable} style={{ minHeight: "100vh" }}>
      <DepartmentClient dept={dept} agents={agents} />
    </div>
  );
}
