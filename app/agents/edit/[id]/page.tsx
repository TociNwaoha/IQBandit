/**
 * app/agents/edit/[id]/page.tsx
 * Protected server page — agent editor.
 * Fetches agent + tools + department policy server-side and passes as initial props to the client.
 */

import { redirect }              from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { getAgent, getAgentTools } from "@/lib/agents";
import { getDepartmentPolicy }      from "@/lib/departmentPolicies";
import AgentEditorClient            from "./AgentEditorClient";

export default async function AgentEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const { id }   = await params;
  const agent     = getAgent(id);
  if (!agent) redirect("/agents");

  const initialTools     = getAgentTools(id);
  const departmentPolicy = agent.department
    ? getDepartmentPolicy(agent.department)
    : null;

  return (
    <AgentEditorClient
      agent={agent}
      initialTools={initialTools}
      departmentPolicy={departmentPolicy}
    />
  );
}
