/**
 * app/mission-control/layout.tsx
 * Mission Control shell — auth-gated, setup-gated.
 * Renders a two-column layout: sidebar sub-nav + main content area.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { cookies } from "next/headers";

const SUB_NAV = [
  { label: "Overview",      href: "/mission-control",              icon: "◉" },
  { label: "Live Feed",     href: "/mission-control/live",         icon: "⚡" },
  { label: "Agents",        href: "/mission-control/agents",       icon: "🤖" },
  { label: "Tasks",         href: "/mission-control/tasks",        icon: "📋" },
  { label: "Approvals",     href: "/mission-control/approvals",    icon: "✅" },
  { label: "Integrations",  href: "/mission-control/integrations", icon: "🔌" },
  { label: "Memory",        href: "/mission-control/memory",       icon: "🧠" },
  { label: "Costs",         href: "/mission-control/costs",        icon: "💰" },
  { label: "Workspace",     href: "/mission-control/workspace",    icon: "📄" },
];

export default async function MissionControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const cookieStore = await cookies();
  const setupDone   = cookieStore.get("iqbandit_setup")?.value === "done";
  if (!setupDone) redirect("/setup");

  return (
    <div className="min-h-screen bg-[#F7F7F4]">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">IQ</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 hidden sm:block">IQBANDIT</span>
          </Link>
          <span className="text-gray-300 text-sm">/</span>
          <span className="text-sm font-semibold text-gray-700">Mission Control</span>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/marketplace" className="text-xs text-gray-500 hover:text-gray-900">← App</Link>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-all">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto flex min-h-[calc(100vh-3.5rem)]">
        {/* Sidebar */}
        <aside className="w-52 shrink-0 border-r border-gray-200 bg-white py-6 px-3 hidden md:block">
          <nav className="flex flex-col gap-0.5">
            {SUB_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
              >
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-6 pt-6 border-t border-gray-100 px-3">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-medium mb-2">Quick Links</p>
            <div className="flex flex-col gap-0.5">
              {[
                { label: "Analytics",    href: "/analytics" },
                { label: "Logs",         href: "/logs" },
                { label: "Tool Logs",    href: "/tool-logs" },
                { label: "Integrations", href: "/integrations" },
                { label: "Agents",       href: "/agents" },
              ].map((link) => (
                <Link key={link.href} href={link.href}
                  className="text-xs text-gray-500 hover:text-gray-800 py-1 hover:underline underline-offset-2">
                  {link.label} ↗
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
