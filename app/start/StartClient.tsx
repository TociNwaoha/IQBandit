"use client";

import Link from "next/link";
import { useState } from "react";

const MODELS = [
  { id: "claude", label: "Claude Opus", abbr: "Claude" },
  { id: "gpt4", label: "GPT-4o", abbr: "GPT-4o" },
  { id: "gemini", label: "Gemini", abbr: "Gemini" },
  { id: "mistral", label: "Mistral", abbr: "Mistral" },
];

const CHANNELS = [
  {
    id: "officebuilding",
    label: "Office Building",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.607L5 14.5m14.8.5l-1.25 8.25M5 14.5l-1.25 8.25" />
      </svg>
    ),
  },
  {
    id: "api",
    label: "API",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
      </svg>
    ),
  },
  {
    id: "discord",
    label: "Discord",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
      </svg>
    ),
  },
  {
    id: "telegram",
    label: "Telegram",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.504-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
];

export function StartClient() {
  const [model, setModel] = useState("claude");
  const [channel, setChannel] = useState("officebuilding");

  return (
    <div
      className="w-full max-w-md mx-auto rounded-2xl p-6"
      style={{
        background: "#FFFFFF",
        border: "1px solid #E8E8E4",
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)",
      }}
    >
      {/* Model selection */}
      <div className="mb-5">
        <p
          className="text-xs font-medium mb-2.5"
          style={{ color: "#6B6B60" }}
        >
          Which model do you want to use?
        </p>
        <div className="grid grid-cols-4 gap-2">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              className="rounded-xl px-2 py-2 text-xs font-medium transition-all"
              style={{
                background: model === m.id ? "#1A1A17" : "#F0F0EC",
                color: model === m.id ? "#F7F7F4" : "#6B6B60",
                border:
                  model === m.id
                    ? "1px solid #1A1A17"
                    : "1px solid transparent",
              }}
            >
              {m.abbr}
            </button>
          ))}
        </div>
      </div>

      {/* Channel selection */}
      <div className="mb-6">
        <p
          className="text-xs font-medium mb-2.5"
          style={{ color: "#6B6B60" }}
        >
          Which integration do you want to setup?
        </p>
        <div className="grid grid-cols-4 gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              onClick={() => setChannel(c.id)}
              className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-medium transition-all"
              style={{
                background: channel === c.id ? "#F7F7F4" : "#F0F0EC",
                color: channel === c.id ? "#1A1A17" : "#6B6B60",
                border:
                  channel === c.id
                    ? "1px solid #E8E8E4"
                    : "1px solid transparent",
                boxShadow:
                  channel === c.id
                    ? "0 1px 3px rgba(0,0,0,0.08)"
                    : "none",
              }}
            >
              {c.icon}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sign in with Google */}
      <Link
        href="/officebuilding"
        className="flex items-center justify-center gap-2.5 w-full rounded-xl px-4 py-2.5 text-sm font-medium mb-3 transition-all hover:bg-[#F0F0EC]"
        style={{
          background: "#F7F7F4",
          color: "#1A1A17",
          border: "1px solid #E8E8E4",
        }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        Sign in with Google
      </Link>

      {/* Start free trial */}
      <Link
        href="/officebuilding"
        className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 text-sm font-semibold mb-3 transition-all hover:opacity-90"
        style={{ background: "#1A1A17", color: "#F7F7F4" }}
      >
        Start Free Trial
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 8l4 4m0 0l-4 4m4-4H3"
          />
        </svg>
      </Link>

      <p
        className="text-center text-xs"
        style={{ color: "#A8A89C" }}
      >
        Sign in to start your free trial.
      </p>
    </div>
  );
}
