/**
 * app/page.tsx
 * Public landing page — no auth required.
 * Mirrors StartClaw design adapted for IQBANDIT.
 */

import Link from "next/link";
import { LandingNav } from "@/components/LandingNav";

/* ─── Data ──────────────────────────────────────────────────── */

const features = [
  {
    title: "Chat security",
    desc: "All conversations are encrypted end-to-end. Your agent interactions and data never leave your own infrastructure.",
    items: ["E2E encryption", "No third-party data sharing", "Full audit logs"],
  },
  {
    title: "Deploy in seconds",
    desc: "From the marketplace to production in a single click. OpenClaw handles routing, scaling, and health monitoring.",
    items: ["One-click deploy", "Health monitoring", "Auto-restart on failure"],
  },
  {
    title: "Install anything",
    desc: "Connect any AI model — Claude, GPT-4, Gemini, Mistral, or your own fine-tuned model via any OpenAI-compatible endpoint.",
    items: ["OpenAI-compatible API", "Model hot-swap", "Custom endpoints"],
  },
  {
    title: "Agent marketplace",
    desc: "Browse 100+ pre-built agents for writing, research, coding, customer support, and more.",
    items: ["100+ agents", "Category filters", "Try before deploying"],
  },
  {
    title: "Built-in playground",
    desc: "Iterate on prompts, test models, and fine-tune behaviour directly from your dashboard — no local setup needed.",
    items: ["Live testing", "System prompt editor", "Message history"],
  },
  {
    title: "Content everything",
    desc: "Automate blog posts, social copy, emails, product descriptions, and internal docs at scale.",
    items: ["Multi-format output", "Tone controls", "Bulk generation"],
  },
];

const plans = [
  {
    name: "Hobby",
    price: "$49",
    period: "/mo",
    desc: "For individuals and side projects.",
    features: [
      "Up to 5 agents",
      "10,000 queries / month",
      "OpenClaw gateway access",
      "Community support",
      "Playground access",
    ],
    cta: "Get started",
    featured: false,
  },
  {
    name: "Pro",
    price: "$99",
    period: "/mo",
    desc: "For teams shipping real products.",
    features: [
      "Unlimited agents",
      "100,000 queries / month",
      "Priority gateway routing",
      "Email + chat support",
      "Usage analytics",
      "Custom models",
    ],
    cta: "Get started",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "$1,500",
    period: "/mo",
    desc: "For organisations with strict requirements.",
    features: [
      "Everything in Pro",
      "Dedicated infrastructure",
      "99.99 % SLA",
      "SSO / SAML",
      "Dedicated support engineer",
      "Custom contracts",
    ],
    cta: "Contact us",
    featured: false,
  },
];

const faqs = [
  {
    q: "What is IQBANDIT?",
    a: "IQBANDIT is an AI agent marketplace and management platform. Browse pre-built agents, deploy them to your own cloud via OpenClaw, and manage everything from a single dashboard.",
  },
  {
    q: "What is OpenClaw?",
    a: "OpenClaw is the AI gateway that powers IQBANDIT. It handles routing, load balancing, and health monitoring for all your agent deployments — keeping your tokens and model credentials server-side only.",
  },
  {
    q: "Which AI models are supported?",
    a: "Any model with an OpenAI-compatible API endpoint — including Claude, GPT-4o, Gemini, Mistral, LLaMA, and any fine-tuned model you host yourself.",
  },
  {
    q: "Is my data private?",
    a: "Yes. All traffic routes through your own OpenClaw instance. We never see your conversations, prompts, or model outputs. Your API keys are encrypted at rest and never leave your server.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your settings page — no penalties, no lock-in. Your agents stay live until the end of your current billing period.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes, every paid plan includes a 14-day free trial. No credit card required to start.",
  },
];

const mockAgents = [
  { name: "Research Assistant", cat: "Research", price: "Free", badge: "Popular" },
  { name: "Code Reviewer", cat: "Coding", price: "$19/mo", badge: null },
  { name: "Content Writer", cat: "Writing", price: "$29/mo", badge: null },
  { name: "Data Analyst", cat: "Analytics", price: "$39/mo", badge: "New" },
  { name: "Support Bot", cat: "Support", price: "$49/mo", badge: "Popular" },
  { name: "SQL Builder", cat: "Coding", price: "$19/mo", badge: null },
];

/* ─── Category icon themes (homepage mockup) ─────────────────── */

const CAT_THEMES: Record<string, { bg: string; icon: React.ReactNode }> = {
  Research: {
    bg: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
        <circle cx="11" cy="11" r="8" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 8v3m0 0v3m0-3h3m-3 0H8" />
      </svg>
    ),
  },
  Coding: {
    bg: "linear-gradient(135deg, #1e3a8a, #2563eb)",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-3 3 3 3M16 9l3 3-3 3M12 5l-2 14" />
      </svg>
    ),
  },
  Writing: {
    bg: "linear-gradient(135deg, #1d4ed8, #60a5fa)",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
  },
  Analytics: {
    bg: "linear-gradient(135deg, #1e40af, #3b82f6)",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  Support: {
    bg: "linear-gradient(135deg, #1d4ed8, #38bdf8)",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
};

function AgentIcon({ cat, size = "sm" }: { cat: string; size?: "sm" | "md" }) {
  const theme = CAT_THEMES[cat] ?? {
    bg: "linear-gradient(135deg, #1e40af, #3b82f6)",
    icon: (
      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  };
  const dim = size === "md" ? "w-9 h-9" : "w-8 h-8";
  return (
    <div
      className={`${dim} rounded-lg flex items-center justify-center shrink-0`}
      style={{ background: theme.bg }}
    >
      {theme.icon}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────── */

function CheckIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 8l4 4m0 0l-4 4m4-4H3"
      />
    </svg>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function LandingPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: "#F7F7F4",
        color: "#1A1A17",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <LandingNav />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="pt-36 pb-20 px-6 text-center relative overflow-hidden"
        style={{ background: "#0C0B09" }}
      >
        {/* Subtle dot-grid */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, #2a2824 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            opacity: 0.5,
          }}
        />

        <div className="relative max-w-3xl mx-auto">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-8 text-xs font-medium"
            style={{
              background: "#1C1A15",
              color: "#8A8880",
              border: "1px solid #2E2A24",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: "#34d399" }}
            />
            Now with OpenClaw gateway support
          </div>

          {/* Headline */}
          <h1
            className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.1] mb-6"
            style={{ color: "#EDECEC" }}
          >
            Your AI agents,
            <br />
            running on your
            <br />
            own cloud.
          </h1>

          <p
            className="text-base md:text-lg mb-10 max-w-lg mx-auto"
            style={{ color: "#7A756D", lineHeight: "1.65" }}
          >
            Browse, deploy, and manage intelligent AI workers in minutes — no
            GPU bills, no vendor lock-in.
          </p>

          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/start"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
              style={{ background: "#EDECEC", color: "#0C0B09" }}
            >
              Get started free <ArrowIcon />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:border-[#3a3835]"
              style={{ color: "#8A8880", border: "1px solid #2E2A24" }}
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* ── App mockup ───────────────────────────────────────── */}
      <section
        className="pb-0 px-6"
        style={{ background: "#0C0B09" }}
      >
        <div className="max-w-5xl mx-auto">
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid #231F1A", background: "#161412" }}
          >
            {/* Browser chrome */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{
                borderBottom: "1px solid #231F1A",
                background: "#141210",
              }}
            >
              <div className="flex gap-1.5">
                {["#3a3835", "#3a3835", "#3a3835"].map((bg, i) => (
                  <div
                    key={i}
                    className="w-3 h-3 rounded-full"
                    style={{ background: bg }}
                  />
                ))}
              </div>
              <div className="flex-1 mx-4">
                <div
                  className="text-xs rounded-md px-3 py-1 text-center max-w-xs mx-auto"
                  style={{ background: "#1C1A15", color: "#4A4845" }}
                >
                  iqbandit.app/marketplace
                </div>
              </div>
            </div>

            {/* Fake marketplace UI */}
            <div className="p-6">
              <div className="flex gap-6">
                {/* Sidebar */}
                <div className="hidden md:block w-40 shrink-0">
                  <div
                    className="text-xs font-semibold mb-3 tracking-wider"
                    style={{ color: "#4A4845" }}
                  >
                    CATEGORIES
                  </div>
                  {[
                    "All agents",
                    "Writing",
                    "Research",
                    "Coding",
                    "Support",
                    "Analytics",
                  ].map((cat, i) => (
                    <div
                      key={cat}
                      className="text-xs px-2.5 py-1.5 rounded-lg mb-1"
                      style={{
                        background: i === 0 ? "#1C1A15" : "transparent",
                        color: i === 0 ? "#EDECEC" : "#5A5752",
                      }}
                    >
                      {cat}
                    </div>
                  ))}
                </div>

                {/* Agent cards grid */}
                <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {mockAgents.map((agent) => (
                    <div
                      key={agent.name}
                      className="rounded-xl p-3"
                      style={{
                        background: "#1C1A15",
                        border: "1px solid #231F1A",
                      }}
                    >
                      <div className="mb-2.5">
                        <AgentIcon cat={agent.cat} size="sm" />
                      </div>
                      <div
                        className="text-xs font-medium mb-0.5"
                        style={{ color: "#EDECEC" }}
                      >
                        {agent.name}
                      </div>
                      <div className="text-xs" style={{ color: "#5A5752" }}>
                        {agent.cat}
                      </div>
                      <div className="flex items-center justify-between mt-2.5">
                        <span
                          className="text-xs font-semibold"
                          style={{ color: "#EDECEC" }}
                        >
                          {agent.price}
                        </span>
                        {agent.badge && (
                          <span
                            className="px-1.5 py-0.5 rounded-full"
                            style={{
                              background: "rgba(245,158,11,0.15)",
                              color: "#fbbf24",
                              fontSize: "10px",
                              fontWeight: 500,
                            }}
                          >
                            {agent.badge}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Slope divider dark→light */}
      <div style={{ background: "#0C0B09" }}>
        <svg
          viewBox="0 0 1440 48"
          preserveAspectRatio="none"
          className="w-full block"
          style={{ height: 48, display: "block" }}
        >
          <path d="M0,48 L1440,0 L1440,48 Z" fill="#F7F7F4" />
        </svg>
      </div>

      {/* ── Features ─────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="mb-14">
            <h2
              className="text-3xl md:text-4xl font-semibold tracking-tight mb-3"
              style={{ color: "#1A1A17" }}
            >
              Everything you need.
              <br />
              Nothing you don&apos;t.
            </h2>
            <p className="text-sm" style={{ color: "#6B6B60" }}>
              Built for developers and teams who value speed and ownership.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feat) => (
              <div
                key={feat.title}
                className="rounded-2xl p-6"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E8E4",
                }}
              >
                <h3
                  className="text-sm font-semibold mb-2"
                  style={{ color: "#1A1A17" }}
                >
                  {feat.title}
                </h3>
                <p
                  className="text-xs leading-relaxed mb-4"
                  style={{ color: "#6B6B60" }}
                >
                  {feat.desc}
                </p>
                <ul className="space-y-2">
                  {feat.items.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2 text-xs"
                      style={{ color: "#6B6B60" }}
                    >
                      <span style={{ color: "#1A1A17" }}>
                        <CheckIcon />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Agent templates strip ─────────────────────────────── */}
      <section className="py-16 px-6" style={{ background: "#F0F0EC" }}>
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h3
              className="text-sm font-semibold"
              style={{ color: "#1A1A17" }}
            >
              Agent templates
            </h3>
            <Link
              href="/login"
              className="text-xs font-medium transition-colors"
              style={{ color: "#6B6B60" }}
            >
              Browse all →
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {mockAgents.map((agent) => (
              <div
                key={agent.name}
                className="rounded-xl p-3 text-center"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E8E4",
                }}
              >
                <div className="flex justify-center mb-2">
                  <AgentIcon cat={agent.cat} size="md" />
                </div>
                <div
                  className="text-xs font-medium leading-tight"
                  style={{ color: "#1A1A17" }}
                >
                  {agent.name}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: "#6B6B60" }}
                >
                  {agent.price}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-3xl md:text-4xl font-semibold tracking-tight mb-3"
              style={{ color: "#1A1A17" }}
            >
              Simple pricing
            </h2>
            <p className="text-sm" style={{ color: "#6B6B60" }}>
              No hidden fees. No surprise invoices. Cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl p-6"
                style={{
                  background: plan.featured ? "#1A1A17" : "#FFFFFF",
                  border: plan.featured
                    ? "1px solid #333330"
                    : "1px solid #E8E8E4",
                }}
              >
                {plan.featured && (
                  <div
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full mb-4"
                    style={{ background: "#F0F0EC", color: "#1A1A17" }}
                  >
                    ✦ Most popular
                  </div>
                )}

                <div className="mb-4">
                  <h3
                    className="text-sm font-semibold mb-1"
                    style={{ color: plan.featured ? "#EDECEC" : "#1A1A17" }}
                  >
                    {plan.name}
                  </h3>
                  <p
                    className="text-xs"
                    style={{
                      color: plan.featured ? "#8A8880" : "#6B6B60",
                    }}
                  >
                    {plan.desc}
                  </p>
                </div>

                <div className="flex items-baseline gap-1 mb-6">
                  <span
                    className="text-3xl font-semibold tracking-tight"
                    style={{ color: plan.featured ? "#EDECEC" : "#1A1A17" }}
                  >
                    {plan.price}
                  </span>
                  <span
                    className="text-sm"
                    style={{ color: plan.featured ? "#8A8880" : "#6B6B60" }}
                  >
                    {plan.period}
                  </span>
                </div>

                <Link
                  href="/login"
                  className="block text-center text-sm font-medium px-4 py-2.5 rounded-xl mb-6 transition-all hover:opacity-90"
                  style={{
                    background: plan.featured ? "#F7F7F4" : "#1A1A17",
                    color: plan.featured ? "#1A1A17" : "#F7F7F4",
                  }}
                >
                  {plan.cta}
                </Link>

                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-xs"
                      style={{
                        color: plan.featured ? "#8A8880" : "#6B6B60",
                      }}
                    >
                      <span
                        style={{
                          color: plan.featured ? "#EDECEC" : "#1A1A17",
                        }}
                      >
                        <CheckIcon />
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section
        id="faq"
        className="py-24 px-6"
        style={{ background: "#F0F0EC" }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-3xl font-semibold tracking-tight mb-3"
              style={{ color: "#1A1A17" }}
            >
              Questions?
            </h2>
            <p className="text-sm" style={{ color: "#6B6B60" }}>
              Everything you need to know before getting started.
            </p>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <div
                key={faq.q}
                className="rounded-2xl p-5"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E8E4",
                }}
              >
                <p
                  className="text-sm font-medium mb-2"
                  style={{ color: "#1A1A17" }}
                >
                  {faq.q}
                </p>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "#6B6B60" }}
                >
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="py-28 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-semibold tracking-tight mb-4"
            style={{ color: "#1A1A17" }}
          >
            Ready to automate?
          </h2>
          <p className="text-sm mb-8" style={{ color: "#6B6B60" }}>
            Deploy your first AI agent in under 5 minutes.
            <br />
            No credit card required.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium transition-all hover:opacity-90"
            style={{ background: "#1A1A17", color: "#F7F7F4" }}
          >
            Deploy now <ArrowIcon />
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer
        className="py-8 px-6"
        style={{
          background: "#F0F0EC",
          borderTop: "1px solid #E8E8E4",
        }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center"
              style={{ background: "#1A1A17" }}
            >
              <span
                className="text-white font-bold"
                style={{ fontSize: "9px" }}
              >
                IQ
              </span>
            </div>
            <span
              className="text-sm font-semibold"
              style={{ color: "#1A1A17" }}
            >
              IQBANDIT
            </span>
          </div>

          <p className="text-xs" style={{ color: "#6B6B60" }}>
            © {new Date().getFullYear()} IQBANDIT. All rights reserved.
          </p>

          <div className="flex gap-5">
            {["Features", "Pricing", "FAQ"].map((label) => (
              <a
                key={label}
                href={`#${label.toLowerCase()}`}
                className="text-xs transition-colors hover:text-[#1A1A17]"
                style={{ color: "#6B6B60" }}
              >
                {label}
              </a>
            ))}
            <Link
              href="/login"
              className="text-xs transition-colors hover:text-[#1A1A17]"
              style={{ color: "#6B6B60" }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
