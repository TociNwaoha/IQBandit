/**
 * app/dashboard/layout.tsx
 * Shared layout for all /dashboard/* pages.
 * Server component — handles auth guard and renders the persistent AgentSidebar.
 */

import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import { AgentSidebar } from "@/components/AgentSidebar";
import Link from "next/link";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg-base)", color: "var(--color-text-primary)" }}
    >
      {/* Topbar */}
      <header
        className="h-12 flex items-center justify-between px-5 shrink-0 sticky top-0 z-10 backdrop-blur-sm"
        style={{
          borderBottom: "1px solid var(--color-border)",
          background: "color-mix(in srgb, var(--color-bg-surface) 80%, transparent)",
        }}
      >
        <Link href="/dashboard" className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center"
            style={{
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.25)",
            }}
          >
            <span className="text-blue-400 text-[10px] font-bold">IQ</span>
          </div>
          <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            IQBANDIT
          </span>
        </Link>
        <div className="flex items-center gap-5">
          <Link
            href="/officebuilding"
            className="text-xs transition-colors"
            style={{ color: "var(--color-text-muted)" }}
          >
            Open Chat
          </Link>
          <Link
            href="/integrations"
            className="text-xs transition-colors"
            style={{ color: "var(--color-text-muted)" }}
          >
            Integrations
          </Link>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-xs transition-colors"
              style={{ color: "var(--color-text-muted)" }}
            >
              Sign out
            </button>
          </form>
          <span className="text-xs hidden lg:block" style={{ color: "var(--color-border-hover)" }}>
            {session.email}
          </span>
        </div>
      </header>

      {/* Body — sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        <AgentSidebar email={session.email} name={session.name} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
