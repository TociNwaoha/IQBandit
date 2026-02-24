"use client";

import Link from "next/link";
import { useState } from "react";

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: "rgba(247,247,244,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid #E8E8E4",
      }}
    >
      <div className="max-w-5xl mx-auto px-6 flex items-center justify-between h-14">
        {/* Logo */}
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

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-7">
          {["Features", "Pricing", "FAQ"].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              className="text-sm transition-colors hover:text-[#1A1A17]"
              style={{ color: "#6B6B60" }}
            >
              {label}
            </a>
          ))}
        </div>

        {/* Auth */}
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden md:block text-sm px-3.5 py-1.5 rounded-lg transition-colors hover:text-[#1A1A17]"
            style={{ color: "#6B6B60" }}
          >
            Sign in
          </Link>
          <Link
            href="/start"
            className="text-sm px-3.5 py-1.5 rounded-lg font-medium transition-colors"
            style={{ background: "#1A1A17", color: "#F7F7F4" }}
          >
            Get started
          </Link>
          {/* Mobile menu toggle */}
          <button
            className="md:hidden ml-1 p-1.5 rounded-lg"
            style={{ color: "#6B6B60" }}
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              {open ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div
          className="md:hidden px-6 pb-4 flex flex-col gap-3"
          style={{ borderTop: "1px solid #E8E8E4" }}
        >
          {["Features", "Pricing", "FAQ"].map((label) => (
            <a
              key={label}
              href={`#${label.toLowerCase()}`}
              className="text-sm py-1"
              style={{ color: "#6B6B60" }}
              onClick={() => setOpen(false)}
            >
              {label}
            </a>
          ))}
          <Link
            href="/login"
            className="text-sm py-1"
            style={{ color: "#6B6B60" }}
          >
            Sign in
          </Link>
        </div>
      )}
    </nav>
  );
}
