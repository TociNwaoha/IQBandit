/**
 * app/pricing/page.tsx
 * Pricing page — publicly accessible, light theme.
 * Server component: checks session (optional), passes auth state to client.
 */

import { getSessionFromCookies } from "@/lib/auth";
import { PricingClient } from "./PricingClient";

export const metadata = {
  title: "Pricing — IQBandit",
  description: "Simple, transparent pricing for IQBandit AI agents.",
};

export default async function PricingPage() {
  const session = await getSessionFromCookies().catch(() => null);
  const isAuthenticated = !!session;

  return <PricingClient isAuthenticated={isAuthenticated} />;
}
