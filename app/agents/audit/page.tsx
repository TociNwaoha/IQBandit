/**
 * app/agents/audit/page.tsx
 * Protected server page — renders the tool consent audit viewer.
 */

import { redirect }              from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { listAgents }            from "@/lib/agents";
import AuditClient               from "./AuditClient";

export default async function AuditPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  // Pre-load the agent list so the filter dropdown is immediately populated
  const agents = listAgents();

  return <AuditClient initialAgents={agents} />;
}
