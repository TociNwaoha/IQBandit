/**
 * app/marketplace/data.ts
 * Mock agent data — replace with a real API/DB call when ready.
 */

import type { Agent } from "@/components/AgentCard";

export const MOCK_AGENTS: Agent[] = [
  {
    id: "1",
    name: "Research Assistant",
    category: "Research",
    description:
      "Deep-dive research on any topic. Synthesises sources, extracts key insights, and produces structured summaries you can act on immediately.",
    price: "Free",
    rating: 4.9,
    badge: "Popular",
  },
  {
    id: "2",
    name: "Code Reviewer",
    category: "Development",
    description:
      "Reviews pull requests and code snippets for bugs, security vulnerabilities, and style improvements. Returns inline comments with fixes.",
    price: "$19/mo",
    rating: 4.7,
    badge: "New",
  },
  {
    id: "3",
    name: "Content Writer",
    category: "Writing",
    description:
      "Generates SEO-optimised blog posts, product copy, and email campaigns. Matches your brand voice and hits target keyword density.",
    price: "$29/mo",
    rating: 4.8,
  },
  {
    id: "4",
    name: "Data Analyst",
    category: "Data",
    description:
      "Analyses CSV exports, database snapshots, and metrics dashboards. Surfaces trends, outliers, and actionable recommendations.",
    price: "$39/mo",
    rating: 4.6,
  },
  {
    id: "5",
    name: "Support Bot",
    category: "Support",
    description:
      "Handles tier-1 customer inquiries with context-aware replies. Escalates to a human when confidence drops below threshold.",
    price: "$49/mo",
    rating: 4.5,
    badge: "Popular",
  },
  {
    id: "6",
    name: "SQL Query Builder",
    category: "Development",
    description:
      "Writes optimised SQL queries from plain-English descriptions. Explains every clause, suggests indexes, and catches common mistakes.",
    price: "$19/mo",
    rating: 4.8,
  },
  {
    id: "7",
    name: "Financial Summariser",
    category: "Finance",
    description:
      "Summarises earnings reports, SEC filings, and financial statements into concise executive briefs with key numbers highlighted.",
    price: "$59/mo",
    rating: 4.7,
    badge: "New",
  },
  {
    id: "8",
    name: "UX Copywriter",
    category: "Design",
    description:
      "Crafts microcopy, onboarding flows, empty states, and error messages that reduce friction and increase feature adoption.",
    price: "$29/mo",
    rating: 4.9,
  },
  {
    id: "9",
    name: "Legal Drafter",
    category: "Legal",
    description:
      "Drafts NDAs, service agreements, and policy documents from a template library. Flags non-standard clauses and missing boilerplate.",
    price: "$79/mo",
    rating: 4.6,
  },
  {
    id: "10",
    name: "Campaign Strategist",
    category: "Marketing",
    description:
      "Plans go-to-market campaigns, writes ad copy variants, and scores creative against target-audience personas.",
    price: "$39/mo",
    rating: 4.7,
    badge: "Popular",
  },
];

export const CATEGORIES = [
  "All",
  "Research",
  "Development",
  "Writing",
  "Data",
  "Support",
  "Finance",
  "Design",
  "Legal",
  "Marketing",
];
