import {
  MessageCircle,
  Brain,
  Zap,
  Globe,
  BarChart2,
  Lock,
  RefreshCw,
  Webhook,
} from "lucide-react";
import type { ReactNode } from "react";

interface Capability {
  icon: ReactNode;
  label: string;
  description: string;
}

const CAPABILITIES: Capability[] = [
  {
    icon: <MessageCircle size={22} />,
    label: "Multi-channel",
    description: "Telegram, Discord & WhatsApp",
  },
  {
    icon: <Brain size={22} />,
    label: "Multi-model",
    description: "Claude, GPT-4o, and more",
  },
  {
    icon: <Zap size={22} />,
    label: "Instant deploy",
    description: "Live in under 5 minutes",
  },
  {
    icon: <Globe size={22} />,
    label: "Web browsing",
    description: "Real-time search access",
  },
  {
    icon: <BarChart2 size={22} />,
    label: "Analytics",
    description: "Usage and performance data",
  },
  {
    icon: <Lock size={22} />,
    label: "Secure by default",
    description: "End-to-end encryption",
  },
  {
    icon: <RefreshCw size={22} />,
    label: "Auto-updates",
    description: "Always on latest models",
  },
  {
    icon: <Webhook size={22} />,
    label: "Webhooks",
    description: "Connect any external system",
  },
];

export default function CapabilitiesGrid() {
  return (
    <section id="capabilities" className="max-w-5xl mx-auto px-4 py-20">
      {/* Section header */}
      <div className="text-center mb-14">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
          What&apos;s included
        </span>
        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-3 mb-4 tracking-tight">
          Everything your agent needs
        </h2>
        <p className="text-gray-500 max-w-md mx-auto">
          One platform. Every tool. Zero infrastructure headaches.
        </p>
      </div>

      {/*
        Grid lines trick:
        Set container bg to gray-200 and gap-px so the gap color
        "bleeds through" as hairline separators — no manual border logic.
      */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-200 rounded-3xl overflow-hidden border border-gray-200">
        {CAPABILITIES.map((cap) => (
          <div
            key={cap.label}
            className="bg-white px-6 py-7 hover:bg-gray-50 transition-colors group"
          >
            <div className="text-gray-400 group-hover:text-gray-900 transition-colors mb-3">
              {cap.icon}
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">
              {cap.label}
            </p>
            <p className="text-xs text-gray-500 leading-relaxed">
              {cap.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
