/**
 * components/AppSidebar.tsx
 * Shared sidebar for all authenticated pages.
 * Server Component — no client JS needed (form POST handles logout).
 */

import Link from "next/link";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Playground", href: "/playground" },
  { label: "Models", href: "#" },
  { label: "Logs", href: "#" },
  { label: "Settings", href: "#" },
];

interface AppSidebarProps {
  activePath: string;
  email: string;
}

export function AppSidebar({ activePath, email }: AppSidebarProps) {
  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-zinc-900/40 border-r border-zinc-800 px-4 py-6 gap-6 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-2">
        <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <span className="text-violet-400 text-sm font-bold">IQ</span>
        </div>
        <span className="text-sm font-semibold text-zinc-100">IQBANDIT</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
              activePath === item.href
                ? "bg-violet-600/15 text-violet-300 font-medium"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Sign out + email at bottom */}
      <div className="mt-auto">
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
          >
            Sign out
          </button>
        </form>
        <p className="text-xs text-zinc-700 px-3 mt-2 truncate">{email}</p>
      </div>
    </aside>
  );
}
