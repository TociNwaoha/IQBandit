/**
 * app/agents/[department]/[agentId]/page.tsx
 * Protected server page — agent chat.
 *
 * Loads agent + conversation, then renders AgentChatClient.
 * Supports:
 *   ?c=<conversationId>  — open a specific conversation (validated to belong to this agent)
 *
 * Renders graceful error pages for:
 *   - Invalid department slug
 *   - Agent not found
 *   - Agent belongs to a different department
 */

import Link                               from "next/link";
import { redirect }                       from "next/navigation";
import { getSessionFromCookies }          from "@/lib/auth";
import { Press_Start_2P }                 from "next/font/google";
import { getDepartment }                  from "@/lib/departments";
import { getAgent }                       from "@/lib/agents";
import { getDepartmentPolicy, resolveEffectiveAgentSettings } from "@/lib/departmentPolicies";
import { gmailListLabels } from "@/lib/mcp/gmail";
import {
  getOrCreateAgentConversation,
  getConversation,
  getMessages,
  listConversationsForAgent,
}                                         from "@/lib/conversations";
import AgentChatClient                    from "./AgentChatClient";

const pixelFont = Press_Start_2P({
  weight:   "400",
  subsets:  ["latin"],
  variable: "--font-pixel",
});

/* ─── Shared error page shell ────────────────────────────────────────────── */

function ErrorPage({
  emoji,
  code,
  heading,
  body,
  backHref,
  backLabel,
}: {
  emoji:     string;
  code:      string;
  heading:   string;
  body:      string;
  backHref:  string;
  backLabel: string;
}) {
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
      <div style={{ fontSize: 52 }} aria-hidden="true">{emoji}</div>
      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      14,
        color:         "#E2E2FF",
        letterSpacing: "0.06em",
      }}>
        {code}
      </div>
      <div style={{
        fontFamily:    "var(--font-pixel, 'Courier New', monospace)",
        fontSize:      8,
        color:         "#6868A0",
        letterSpacing: "0.2em",
        lineHeight:    2,
      }}>
        {heading}
      </div>
      <div style={{
        fontFamily: "monospace",
        fontSize:   13,
        color:      "#353560",
        maxWidth:   360,
        lineHeight: 1.6,
      }}>
        {body}
      </div>
      <Link
        href={backHref}
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
        {backLabel}
      </Link>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export default async function AgentChatPage({
  params,
  searchParams,
}: {
  params:       Promise<{ department: string; agentId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const { department, agentId } = await params;
  const sp                      = await searchParams;

  const dept  = getDepartment(department);
  if (!dept) {
    return (
      <div className={pixelFont.variable}>
        <ErrorPage
          emoji="🏚"
          code="404"
          heading="DEPARTMENT NOT FOUND"
          body="That department slug doesn't exist."
          backHref="/agents"
          backLabel="← BACK TO HUB"
        />
      </div>
    );
  }

  const agent = getAgent(agentId);
  if (!agent) {
    return (
      <div className={pixelFont.variable}>
        <ErrorPage
          emoji="🤖"
          code="404"
          heading="AGENT NOT FOUND"
          body="This agent doesn't exist or may have been deleted."
          backHref={`/agents/${department}`}
          backLabel={`← BACK TO ${dept.label.toUpperCase()}`}
        />
      </div>
    );
  }

  // Agent exists but is registered under a different department
  if (agent.department && agent.department !== department) {
    return (
      <div className={pixelFont.variable}>
        <ErrorPage
          emoji="🚪"
          code="WRONG DEPARTMENT"
          heading="AGENT IS IN ANOTHER BUILDING"
          body={`This agent belongs to the "${agent.department}" department, not "${department}". Use the correct department route.`}
          backHref={`/agents/${agent.department}`}
          backLabel={`← GO TO ${agent.department.toUpperCase()}`}
        />
      </div>
    );
  }

  // Resolve which conversation to open
  const model = agent.default_model || "openclaw:main";
  let conversation = null;
  let invalidConvRequested = false;

  const requestedConvId = typeof sp.c === "string" ? sp.c.trim() : "";
  if (requestedConvId) {
    // Validate: conversation must exist and belong to this agent
    const candidate = getConversation(requestedConvId);
    if (candidate && candidate.agent_id === agentId) {
      conversation = candidate;
    } else {
      // The ?c= param was provided but refers to an invalid / foreign conversation
      invalidConvRequested = true;
    }
  }

  // Fall back to default (most-recent or new)
  if (!conversation) {
    conversation = getOrCreateAgentConversation(agentId, model);
  }

  if (!conversation) redirect(`/agents/${department}`);

  const initialMessages  = getMessages(conversation.id);
  const conversations    = listConversationsForAgent(agentId, 8);

  // Resolve effective settings (department policy + agent overrides)
  const deptPolicy        = agent.department ? getDepartmentPolicy(agent.department) : null;
  const effectiveSettings = resolveEffectiveAgentSettings(agent, deptPolicy);

  // Probe the MCP Gmail server to determine connectivity.
  // Race against a 3-second timeout so a misconfigured/slow MCP server
  // never delays the page significantly.
  let gmailConnected = false;
  try {
    await Promise.race([
      gmailListLabels(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 3_000)),
    ]);
    gmailConnected = true;
  } catch {
    // MCP not configured, server not running, or tokens not valid → not connected
  }

  return (
    <div className={pixelFont.variable} style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AgentChatClient
        agent={agent}
        dept={dept}
        conversationId={conversation.id}
        initialMessages={initialMessages}
        conversations={conversations.map((c) => ({
          id:         c.id,
          title:      c.title,
          updated_at: c.updated_at,
        }))}
        invalidConvRequested={invalidConvRequested}
        effectiveSettings={effectiveSettings}
        gmailConnected={gmailConnected}
      />
    </div>
  );
}
