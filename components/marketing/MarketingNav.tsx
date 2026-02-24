"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export default function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Scroll shadow: appears once the user has scrolled past the nav height
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-white border-b border-gray-100 shadow-[0_1px_20px_rgba(0,0,0,0.06)]"
          : "bg-white/95 backdrop-blur-md border-b border-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* ── Logo ── */}
        <Link href="/deploy" className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 rounded-[7px] bg-gray-900 flex items-center justify-center shadow-sm">
            <span className="text-white text-[10px] font-black tracking-tight leading-none">
              IQ
            </span>
          </div>
          <span className="font-bold text-gray-900 text-[15px] tracking-tight">
            IQBANDIT
          </span>
        </Link>

        {/* ── Desktop nav links ── */}
        <div className="hidden md:flex items-center gap-7">
          {[
            { label: "Features", href: "#features" },
            { label: "Capabilities", href: "#capabilities" },
            { label: "Pricing", href: "#pricing" },
            { label: "Docs", href: "/docs" },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-[13px] text-gray-500 hover:text-gray-900 transition-colors duration-150 font-medium"
            >
              {item.label}
            </Link>
          ))}
        </div>

        {/* ── Desktop CTA buttons ── */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            href="/login"
            className="text-[13px] font-medium text-gray-600 hover:text-gray-900 transition-colors duration-150 px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            Sign In
          </Link>
          <Link
            href="/login"
            className="text-[13px] font-semibold bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-black transition-colors duration-150 shadow-sm"
          >
            Get Started
          </Link>
        </div>

        {/* ── Mobile menu toggle ── */}
        <button
          className="md:hidden p-2 -mr-1 text-gray-500 hover:text-gray-900 transition-colors duration-150 rounded-lg hover:bg-gray-50"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col">
          {[
            { label: "Features", href: "#features" },
            { label: "Capabilities", href: "#capabilities" },
            { label: "Pricing", href: "#pricing" },
          ].map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm text-gray-600 py-2.5 hover:text-gray-900 transition-colors duration-150"
              onClick={() => setMobileOpen(false)}
            >
              {item.label}
            </Link>
          ))}
          <div className="border-t border-gray-100 mt-2 pt-3 flex flex-col gap-2">
            <Link
              href="/login"
              className="text-sm text-gray-600 py-2.5"
              onClick={() => setMobileOpen(false)}
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="text-sm font-semibold bg-gray-900 text-white px-4 py-3 rounded-xl text-center hover:bg-black transition-colors duration-150"
              onClick={() => setMobileOpen(false)}
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
