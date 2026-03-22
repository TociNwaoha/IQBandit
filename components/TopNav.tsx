"use client";

/**
 * components/TopNav.tsx
 * Sticky top navigation for all authenticated pages.
 * Theme-aware: uses CSS variables for light/dark mode support.
 */

import Link from "next/link";
import { useState } from "react";

const NAV_ITEMS = [
  { label: "Marketplace", href: "/marketplace" },
  { label: "Office Building", href: "/officebuilding" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Integrations", href: "/integrations" },
  { label: "Tool Logs", href: "/tool-logs" },
  { label: "Mission Control", href: "/mission-control" },
  { label: "Settings", href: "/settings" },
];

interface TopNavProps {
  activePath: string;
  email: string;
}

function NavLink({ label, href, isActive }: { label: string; href: string; isActive: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      href={href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "6px 12px",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        textDecoration: "none",
        transition: "background 0.15s, color 0.15s",
        background: isActive || hovered ? "var(--color-bg-surface-2)" : "transparent",
        color: isActive || hovered ? "var(--color-text-primary)" : "var(--color-text-secondary)",
      }}
    >
      {label}
    </Link>
  );
}

export function TopNav({ activePath, email }: TopNavProps) {
  const [signOutHovered, setSignOutHovered] = useState(false);

  return (
    <header
      className="sticky top-0 z-20 backdrop-blur-sm"
      style={{
        background: "color-mix(in srgb, var(--color-bg-surface) 95%, transparent)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        {/* Brand + nav */}
        <div className="flex items-center gap-8 min-w-0">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-tight">IQ</span>
            </div>
            <span
              className="text-sm font-semibold hidden sm:block"
              style={{ color: "var(--color-text-primary)" }}
            >
              IQBANDIT
            </span>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.label}
                label={item.label}
                href={item.href}
                isActive={activePath === item.href}
              />
            ))}
          </nav>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          <span
            className="hidden lg:block text-xs max-w-[180px] truncate"
            style={{ color: "var(--color-text-muted)" }}
          >
            {email}
          </span>
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              onMouseEnter={() => setSignOutHovered(true)}
              onMouseLeave={() => setSignOutHovered(false)}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: signOutHovered ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                padding: "6px 12px",
                borderRadius: 8,
                border: `1px solid ${signOutHovered ? "var(--color-border-hover)" : "var(--color-border)"}`,
                background: signOutHovered ? "var(--color-bg-surface-2)" : "transparent",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
