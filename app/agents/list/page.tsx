/**
 * app/agents/list/page.tsx
 * Protected server page — renders the agents management list.
 */

import { redirect }              from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import AgentsClient               from "../AgentsClient";

export default async function AgentsListPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  return <AgentsClient />;
}
