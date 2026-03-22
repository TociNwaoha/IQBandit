/**
 * app/dashboard/page.tsx
 * Dashboard home — shows agent team status and quick actions.
 * Server component: handles auth and passes email to the client welcome widget.
 */

import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { DashboardWelcome } from "./DashboardWelcome";

export default async function DashboardPage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  return <DashboardWelcome email={session.email} />;
}
