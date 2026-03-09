/**
 * app/agents/policy/page.tsx
 * Protected server page — department policy editor.
 *
 * Loads all departments, their policies, and the count of agents per
 * department server-side, then renders PolicyClient.
 */

import { redirect }              from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { DEPARTMENTS }           from "@/lib/departments";
import { listDepartmentPolicies, type DepartmentPolicy } from "@/lib/departmentPolicies";
import { listAgents }            from "@/lib/agents";
import PolicyClient              from "./PolicyClient";

export default async function PolicyPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const policies = listDepartmentPolicies();
  const agents   = listAgents();

  // Map department_id → policy for easy lookup
  const policyMap = new Map<string, DepartmentPolicy>(
    policies.map((p) => [p.department_id, p]),
  );

  // Count agents per department
  const agentCounts = new Map<string, number>();
  for (const agent of agents) {
    if (agent.department) {
      agentCounts.set(agent.department, (agentCounts.get(agent.department) ?? 0) + 1);
    }
  }

  // Build the prop payload — one entry per department
  const deptPolicies = DEPARTMENTS.map((dept) => ({
    dept,
    policy:     policyMap.get(dept.id) ?? null,
    agentCount: agentCounts.get(dept.id) ?? 0,
  }));

  return <PolicyClient deptPolicies={deptPolicies} />;
}
