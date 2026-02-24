/**
 * components/TopNav.tsx
 * Sticky top navigation for all authenticated pages.
 * Server Component — the logout button is a native form POST, no JS needed.
 */

import Link from "next/link";

const NAV_ITEMS = [
  { label: "Marketplace", href: "/marketplace" },
  { label: "Office Building", href: "/officebuilding" },
  { label: "Settings", href: "/settings" },
];

interface TopNavProps {
  activePath: string;
  email: string;
}

export function TopNav({ activePath, email }: TopNavProps) {
  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        {/* Brand + nav */}
        <div className="flex items-center gap-8 min-w-0">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 shrink-0"
          >
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-tight">
                IQ
              </span>
            </div>
            <span className="text-sm font-semibold text-gray-900 hidden sm:block">
              IQBANDIT
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activePath === item.href
                    ? "text-gray-900 bg-gray-100"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden lg:block text-xs text-gray-400 max-w-[180px] truncate">
            {email}
          </span>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
