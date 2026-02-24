/**
 * app/start/page.tsx
 * Public pre-signup page — cloned from StartClaw deploy page for IQBANDIT.
 * No auth required.
 */

import Link from "next/link";
import { StartClient } from "./StartClient";

/* ─── Sub-components ─────────────────────────────────────────── */

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm" style={{ color: "#6B6B60" }}>
      <svg
        className="w-4 h-4 mt-0.5 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
        style={{ color: "#1A1A17" }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {children}
    </li>
  );
}

function StatCard({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  return (
    <div className="text-center px-6 py-4">
      <div
        className="text-2xl font-semibold tracking-tight mb-0.5"
        style={{ color: "#1A1A17" }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: "#6B6B60" }}>
        {label}
      </div>
    </div>
  );
}

/* ─── Page nav ───────────────────────────────────────────────── */

function StartNav() {
  return (
    <nav
      className="sticky top-0 z-50 flex items-center justify-between px-6 h-14"
      style={{
        background: "rgba(247,247,244,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid #E8E8E4",
      }}
    >
      <Link href="/" className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "#1A1A17" }}
        >
          <span className="text-white font-bold" style={{ fontSize: "10px" }}>
            IQ
          </span>
        </div>
        <span
          className="text-sm font-semibold tracking-tight"
          style={{ color: "#1A1A17" }}
        >
          IQBANDIT
        </span>
      </Link>

      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="text-sm px-3.5 py-1.5 rounded-lg font-medium transition-all hover:opacity-90"
          style={{ background: "#1A1A17", color: "#F7F7F4" }}
        >
          Sign Up
        </Link>
      </div>
    </nav>
  );
}

/* ─── Page ───────────────────────────────────────────────────── */

export default function StartPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: "#F7F7F4",
        color: "#1A1A17",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <StartNav />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="pt-16 pb-10 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Left — copy */}
            <div className="pt-4">
              <h1
                className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1] mb-4"
                style={{ color: "#1A1A17" }}
              >
                Deploy an AI Agent in 60 seconds.
              </h1>
              <p
                className="text-sm leading-relaxed max-w-sm"
                style={{ color: "#6B6B60" }}
              >
                From the IQBANDIT marketplace to your first live query in under
                a minute. Pick a model, pick an integration, and you&apos;re
                live — no GPU bills, no infrastructure headaches.
              </p>
            </div>

            {/* Right — interactive form card */}
            <StartClient />
          </div>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────── */}
      <section
        className="py-2 px-6 border-y"
        style={{ background: "#FFFFFF", borderColor: "#E8E8E4" }}
      >
        <div className="max-w-3xl mx-auto flex items-center justify-around flex-wrap">
          <StatCard value="100+" label="agents in marketplace" />
          <div
            className="hidden sm:block w-px h-8 self-center"
            style={{ background: "#E8E8E4" }}
          />
          <StatCard value="2,600" label="deployments launched" />
          <div
            className="hidden sm:block w-px h-8 self-center"
            style={{ background: "#E8E8E4" }}
          />
          <StatCard value="48 hrs" label="free trial, no card needed" />
        </div>
      </section>

      {/* ── Your own dedicated gateway ───────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "#A8A89C" }}
            >
              Infrastructure
            </p>
            <h2
              className="text-2xl md:text-3xl font-semibold tracking-tight mb-4"
              style={{ color: "#1A1A17" }}
            >
              Your own dedicated server.
            </h2>
            <p
              className="text-sm leading-relaxed mb-6"
              style={{ color: "#6B6B60" }}
            >
              Your OpenClaw gateway runs on your own infrastructure. You own
              the tokens, the traffic, and the logs — we never touch your
              data.
            </p>
            <ul className="space-y-3">
              <CheckItem>100% server-hosted — no shared tenancy</CheckItem>
              <CheckItem>No third-party access to your API keys</CheckItem>
              <CheckItem>All requests encrypted in transit</CheckItem>
              <CheckItem>Health monitoring + auto-restart built in</CheckItem>
            </ul>
          </div>

          {/* Code block mockup */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "#0C0B09", border: "1px solid #231F1A" }}
          >
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ borderBottom: "1px solid #231F1A" }}
            >
              <div className="flex gap-1.5">
                {["#3a3835", "#3a3835", "#3a3835"].map((bg, i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: bg }}
                  />
                ))}
              </div>
              <span
                className="text-xs ml-2"
                style={{ color: "#4A4845" }}
              >
                terminal
              </span>
            </div>
            <div className="p-5 font-mono text-xs leading-relaxed">
              <p style={{ color: "#4A4845" }}># Start your OpenClaw gateway</p>
              <p className="mt-2">
                <span style={{ color: "#7A9E7E" }}>$</span>
                <span style={{ color: "#EDECEC" }}>
                  {" "}openclaw start --port 19001
                </span>
              </p>
              <p className="mt-1" style={{ color: "#4A4845" }}>
                ✓ Gateway listening on{" "}
                <span style={{ color: "#7A9E7E" }}>
                  http://127.0.0.1:19001
                </span>
              </p>
              <p className="mt-1" style={{ color: "#4A4845" }}>
                ✓ Auth token ready
              </p>
              <p className="mt-1" style={{ color: "#4A4845" }}>
                ✓ Health check passed
              </p>
              <p className="mt-4">
                <span style={{ color: "#7A9E7E" }}>$</span>
                <span style={{ color: "#EDECEC" }}>
                  {" "}curl http://127.0.0.1:19001/v1/chat/completions \
                </span>
              </p>
              <p className="ml-4" style={{ color: "#EDECEC" }}>
                -H{" "}
                <span style={{ color: "#C9956C" }}>
                  &quot;Authorization: Bearer $TOKEN&quot;
                </span>
              </p>
              <p className="ml-4" style={{ color: "#EDECEC" }}>
                -d{" "}
                <span style={{ color: "#C9956C" }}>
                  &apos;&#123;&quot;model&quot;:&quot;claude-opus-4&quot;&#125;&apos;
                </span>
              </p>
              <p className="mt-3" style={{ color: "#4A4845" }}>
                &lt;{" "}
                <span style={{ color: "#7A9E7E" }}>
                  200 OK — response streaming
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Build with your agent ─────────────────────────────── */}
      <section
        className="py-20 px-6"
        style={{ background: "#F0F0EC" }}
      >
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Browser mockup */}
          <div
            className="rounded-2xl overflow-hidden order-2 lg:order-1"
            style={{ background: "#FFFFFF", border: "1px solid #E8E8E4" }}
          >
            {/* Browser chrome */}
            <div
              className="flex items-center gap-2 px-4 py-2.5"
              style={{ borderBottom: "1px solid #E8E8E4", background: "#F7F7F4" }}
            >
              <div className="flex gap-1.5">
                {["#E8E8E4", "#E8E8E4", "#E8E8E4"].map((bg, i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: bg }}
                  />
                ))}
              </div>
              <div
                className="flex-1 text-xs rounded px-3 py-1 text-center max-w-xs mx-auto"
                style={{ background: "#F0F0EC", color: "#A8A89C" }}
              >
                iqbandit.app/officebuilding
              </div>
            </div>

            {/* Playground preview */}
            <div className="p-4 space-y-3">
              {/* Chat messages */}
              <div className="flex justify-end">
                <div
                  className="text-xs rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[75%]"
                  style={{ background: "#1A1A17", color: "#F7F7F4" }}
                >
                  Summarise last quarter&apos;s sales data into 3 bullet
                  points.
                </div>
              </div>
              <div className="flex justify-start">
                <div
                  className="text-xs rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[75%]"
                  style={{
                    background: "#FFFFFF",
                    border: "1px solid #E8E8E4",
                    color: "#1A1A17",
                  }}
                >
                  <p className="font-medium mb-1.5">Q3 Summary</p>
                  <ul className="space-y-1" style={{ color: "#6B6B60" }}>
                    <li>• Revenue up 24% YoY to $2.4M</li>
                    <li>• 3 new enterprise accounts closed</li>
                    <li>• Churn reduced from 4.2% → 2.1%</li>
                  </ul>
                </div>
              </div>
              {/* Input bar */}
              <div
                className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
                style={{ border: "1px solid #E8E8E4", background: "#F7F7F4" }}
              >
                <span
                  className="flex-1 text-xs"
                  style={{ color: "#A8A89C" }}
                >
                  Ask your agent anything…
                </span>
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "#1A1A17" }}
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="white"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Copy */}
          <div className="order-1 lg:order-2">
            <p
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "#A8A89C" }}
            >
              Build & iterate
            </p>
            <h2
              className="text-2xl md:text-3xl font-semibold tracking-tight mb-4"
              style={{ color: "#1A1A17" }}
            >
              Chat with your agent via Playground or API.
            </h2>
            <p
              className="text-sm leading-relaxed mb-6"
              style={{ color: "#6B6B60" }}
            >
              Every agent runs on its own endpoint. Query it from the
              browser playground, call it from your codebase, or connect
              any OpenAI-compatible client directly to your gateway.
            </p>
            <ul className="space-y-3">
              <CheckItem>Query from the built-in playground</CheckItem>
              <CheckItem>
                Call directly from your code — any OpenAI SDK works
              </CheckItem>
              <CheckItem>Stream responses in real-time</CheckItem>
              <CheckItem>Message history saved automatically</CheckItem>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Everything your agent can do ──────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-2xl md:text-3xl font-semibold tracking-tight mb-3"
              style={{ color: "#1A1A17" }}
            >
              Everything your agent can do.
            </h2>
            <p className="text-sm" style={{ color: "#6B6B60" }}>
              Pre-built agents handle real workflows out of the box.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {[
              { icon: "🔍", label: "Web search" },
              { icon: "💻", label: "Code generation" },
              { icon: "📄", label: "File analysis" },
              { icon: "📊", label: "Data summaries" },
              { icon: "✍️", label: "Content writing" },
              { icon: "💬", label: "Support chat" },
              { icon: "📧", label: "Email drafts" },
              { icon: "📅", label: "Scheduling" },
              { icon: "🔗", label: "API calls" },
              { icon: "🗄️", label: "SQL queries" },
              { icon: "🧠", label: "Research" },
              { icon: "🎯", label: "Lead scoring" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex flex-col items-center gap-2 rounded-2xl p-4"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E8E4",
                }}
              >
                <span className="text-2xl">{item.icon}</span>
                <span
                  className="text-xs font-medium text-center"
                  style={{ color: "#1A1A17" }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3 steps ──────────────────────────────────────────── */}
      <section
        className="py-20 px-6"
        style={{ background: "#F0F0EC" }}
      >
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-2xl md:text-3xl font-semibold tracking-tight mb-3"
              style={{ color: "#1A1A17" }}
            >
              Live in 3 steps. Free for 48 hours.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: "01",
                title: "Pick model & channel",
                desc: "Choose from Claude, GPT-4o, Gemini, or Mistral. Select Playground, API, Discord, or Telegram.",
                detail: [
                  "Select Claude or GPT-4o",
                  "Select your integration",
                ],
              },
              {
                step: "02",
                title: "Start free trial",
                desc: "Sign in, connect your OpenClaw gateway, and your agent is reachable in under 60 seconds.",
                detail: [
                  "Complete the setup form",
                  "Gateway connects automatically",
                ],
              },
              {
                step: "03",
                title: "You're live",
                desc: "Your agent is deployed and ready. Query it via the playground or start building on the API.",
                detail: [
                  "First query in < 1 minute",
                  "No ongoing maintenance",
                ],
              },
            ].map((s) => (
              <div
                key={s.step}
                className="rounded-2xl p-6"
                style={{
                  background: "#FFFFFF",
                  border: "1px solid #E8E8E4",
                }}
              >
                <div
                  className="text-xs font-semibold mb-4 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "#F0F0EC", color: "#6B6B60" }}
                >
                  {s.step}
                </div>
                <h3
                  className="text-sm font-semibold mb-2"
                  style={{ color: "#1A1A17" }}
                >
                  {s.title}
                </h3>
                <p
                  className="text-xs leading-relaxed mb-4"
                  style={{ color: "#6B6B60" }}
                >
                  {s.desc}
                </p>
                <ul className="space-y-1.5">
                  {s.detail.map((d) => (
                    <li
                      key={d}
                      className="flex items-center gap-2 text-xs"
                      style={{ color: "#6B6B60" }}
                    >
                      <span
                        className="w-1 h-1 rounded-full shrink-0 inline-block"
                        style={{ background: "#A8A89C" }}
                      />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Custom agent CTA ──────────────────────────────────── */}
      <section className="py-20 px-6">
        <div className="max-w-xl mx-auto text-center">
          <h2
            className="text-2xl font-semibold tracking-tight mb-3"
            style={{ color: "#1A1A17" }}
          >
            Need a custom agent?
          </h2>
          <p
            className="text-sm mb-8"
            style={{ color: "#6B6B60" }}
          >
            We build and deploy custom solutions for your business.
          </p>

          <div className="flex gap-2 max-w-sm mx-auto">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-all"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E8E8E4",
                color: "#1A1A17",
              }}
            />
            <Link
              href="/login"
              className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition-all hover:opacity-90"
              style={{ background: "#1A1A17", color: "#F7F7F4" }}
            >
              Get In Touch
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer
        className="py-6 px-6 flex items-center justify-center gap-6"
        style={{
          borderTop: "1px solid #E8E8E4",
          background: "#F7F7F4",
        }}
      >
        <p className="text-xs" style={{ color: "#A8A89C" }}>
          © {new Date().getFullYear()} IQBANDIT
        </p>
        <a
          href="#"
          className="text-xs transition-colors hover:text-[#1A1A17]"
          style={{ color: "#A8A89C" }}
        >
          Terms
        </a>
        <a
          href="#"
          className="text-xs transition-colors hover:text-[#1A1A17]"
          style={{ color: "#A8A89C" }}
        >
          Privacy
        </a>
      </footer>
    </div>
  );
}
