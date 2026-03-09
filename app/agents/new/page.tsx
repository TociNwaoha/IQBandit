/**
 * app/agents/new/page.tsx
 * Agent Builder — create a new agent with full file-structure setup.
 * Mirrors the OpenClaw workspace markdown files (IDENTITY, SOUL, TOOLS, AGENTS).
 */

import { getSessionFromCookies } from "@/lib/auth";
import { redirect }              from "next/navigation";
import { DEPARTMENTS }           from "@/lib/departments";
import AgentBuilderClient        from "./AgentBuilderClient";

export default async function NewAgentPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  return <AgentBuilderClient departments={DEPARTMENTS} />;
}
