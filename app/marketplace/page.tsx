/**
 * app/marketplace/page.tsx
 * Main authenticated landing — agent marketplace.
 * Server Component: handles auth and passes data to the interactive client.
 */

import { getSessionFromCookies } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";
import { AgentCard } from "@/components/AgentCard";
import { MarketplaceClient } from "./MarketplaceClient";
import { MOCK_AGENTS, CATEGORIES } from "./data";
import { redirect } from "next/navigation";

export default async function MarketplacePage() {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const featured = MOCK_AGENTS.filter((a) => a.badge === "Popular");

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav activePath="/marketplace" email={session.email} />

      <main className="max-w-7xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Agent Marketplace
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Discover and deploy AI agents for your workflows.
          </p>
        </div>

        {/* Featured strip */}
        {featured.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5">
                Popular
              </span>
              <h2 className="text-sm font-semibold text-gray-700">
                Trending this week
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {featured.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
            </div>
          </section>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">All agents</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        {/* Interactive search + grid */}
        <MarketplaceClient agents={MOCK_AGENTS} categories={CATEGORIES} />
      </main>
    </div>
  );
}
