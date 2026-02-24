"use client";

import { useState } from "react";
import { Check } from "lucide-react";

type Model = "claude-opus" | "gpt-4o";
type Channel = "telegram" | "discord" | "whatsapp";

interface ModelOption {
  id: Model;
  label: string;
  badge?: string;
}

interface ChannelOption {
  id: Channel;
  label: string;
  emoji: string;
}

const MODELS: ModelOption[] = [
  { id: "claude-opus", label: "Claude Opus", badge: "Recommended" },
  { id: "gpt-4o", label: "GPT-4o" },
];

const CHANNELS: ChannelOption[] = [
  { id: "telegram", label: "Telegram", emoji: "✈️" },
  { id: "discord", label: "Discord", emoji: "🎮" },
  { id: "whatsapp", label: "WhatsApp", emoji: "💬" },
];

// Shared chip class fragments to keep the JSX readable
const chipBase =
  "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all duration-150 cursor-pointer";
const chipActive = "bg-gray-900 text-white border-gray-900 shadow-sm";
const chipIdle =
  "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50";

export default function DeployConfiguratorCard() {
  const [selectedModel, setSelectedModel] = useState<Model>("claude-opus");
  const [selectedChannel, setSelectedChannel] = useState<Channel>("telegram");
  // Mock auth state — flip to true to preview the active CTA
  const [isSignedIn] = useState(false);

  return (
    /*
     * Elevated card:
     * – rounded-3xl matches the hero's round aesthetic
     * – custom diffuse shadow instead of the default shadow-sm
     * – ring-1 ring-black/5 adds a hair-thin contrast edge on white BGs
     */
    <div className="w-full max-w-md mx-auto bg-white rounded-3xl border border-gray-200 shadow-[0_4px_32px_rgba(0,0,0,0.07)] ring-1 ring-black/[0.03] p-7 space-y-5">

      {/* ── Card header ── */}
      <div className="pb-1">
        <h2 className="text-[17px] font-bold text-gray-900 tracking-tight mb-1">
          Deploy Your Agent
        </h2>
        <p className="text-sm text-gray-400 leading-snug">
          Configure and launch in seconds.
        </p>
      </div>

      {/* ── Model selector ── */}
      <div className="space-y-2">
        <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          AI Model
        </label>
        <div className="flex gap-2 flex-wrap">
          {MODELS.map((model) => {
            const active = selectedModel === model.id;
            return (
              <button
                key={model.id}
                onClick={() => setSelectedModel(model.id)}
                className={`${chipBase} ${active ? chipActive : chipIdle}`}
              >
                {active && <Check size={11} strokeWidth={3} />}
                {model.label}
                {model.badge && (
                  <span
                    className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                      active
                        ? "bg-white/20 text-white"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {model.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Channel selector ── */}
      <div className="space-y-2">
        <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Deploy Channel
        </label>
        <div className="flex gap-2 flex-wrap">
          {CHANNELS.map((channel) => {
            const active = selectedChannel === channel.id;
            return (
              <button
                key={channel.id}
                onClick={() => setSelectedChannel(channel.id)}
                className={`${chipBase} ${active ? chipActive : chipIdle}`}
              >
                <span className="text-base leading-none">{channel.emoji}</span>
                {channel.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-gray-100 !mt-6" />

      {/* ── Google sign-in (mock) ── */}
      {!isSignedIn && (
        <button className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-all duration-150">
          {/* Inline Google logo — no external assets */}
          <svg
            width="17"
            height="17"
            viewBox="0 0 18 18"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.337 17.64 11.93 17.64 9.2z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>
      )}

      {/* ── Primary CTA ── */}
      <button
        disabled={!isSignedIn}
        className={`w-full py-3.5 rounded-xl text-sm font-bold tracking-tight transition-all duration-150 ${
          isSignedIn
            ? "bg-gray-900 text-white hover:bg-black shadow-sm hover:shadow-md cursor-pointer"
            : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
        }`}
      >
        {isSignedIn ? "Start Free Trial" : "Sign in to continue"}
      </button>

      {/* ── Helper text ── */}
      <p className="text-center text-[11px] text-gray-400 !mt-3">
        No credit card required · Free for 14 days
      </p>
    </div>
  );
}
