"use client";

/**
 * app/marketplace/MarketplaceClient.tsx
 * Client component — handles search and category filtering.
 * Receives the full agent list from the server component.
 */

import { useState } from "react";
import { AgentCard, type Agent } from "@/components/AgentCard";

interface MarketplaceClientProps {
  agents: Agent[];
  categories: string[];
}

export function MarketplaceClient({ agents, categories }: MarketplaceClientProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered = agents.filter((a) => {
    const matchesCategory =
      activeCategory === "All" || a.category === activeCategory;
    const q = search.toLowerCase();
    const matchesSearch =
      q === "" ||
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  return (
    <div>
      {/* Search + category filters */}
      <div className="mb-8 flex flex-col gap-4">
        {/* Search bar */}
        <div className="relative max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search agents…"
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 transition-all"
          />
        </div>

        {/* Category tabs — scrollable on mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-900"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      {search || activeCategory !== "All" ? (
        <p className="text-xs text-gray-400 mb-4">
          {filtered.length === 0
            ? "No agents match your search"
            : `${filtered.length} agent${filtered.length !== 1 ? "s" : ""} found`}
        </p>
      ) : null}

      {/* Agent grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-sm font-medium text-gray-400">No agents found</p>
          <button
            onClick={() => {
              setSearch("");
              setActiveCategory("All");
            }}
            className="mt-3 text-xs text-violet-600 hover:text-violet-700 underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
