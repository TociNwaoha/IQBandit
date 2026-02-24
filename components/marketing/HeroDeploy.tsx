import { ArrowRight, Zap } from "lucide-react";
import Link from "next/link";

// Distinct background tones for each avatar so the stacked ring looks varied
const AVATARS = [
  { initials: "AR", bg: "bg-gray-200" },
  { initials: "PN", bg: "bg-stone-200" },
  { initials: "JC", bg: "bg-zinc-200" },
  { initials: "MK", bg: "bg-slate-200" },
];

export default function HeroDeploy() {
  return (
    <div className="space-y-8">
      {/* ── Eyebrow badge ── */}
      <div className="inline-flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3.5 py-1.5 shadow-sm">
        <Zap size={12} className="text-gray-400 fill-gray-400" />
        <span className="text-xs text-gray-600 font-medium tracking-tight">
          Deploy your AI agent in minutes
        </span>
      </div>

      {/* ── Main heading — display-scale, tight leading ── */}
      <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[0.95]">
        <span className="text-gray-900">Your AI agent,</span>
        <br />
        <span className="text-gray-400">everywhere</span>
        <br />
        <span className="text-gray-400">you work.</span>
      </h1>

      {/* ── Sub-copy ── */}
      <p className="text-[17px] text-gray-500 max-w-[440px] leading-relaxed">
        Deploy powerful AI agents to Telegram, Discord, or WhatsApp in minutes.
        Choose your model, connect your channels, and let IQBANDIT handle the
        rest.
      </p>

      {/* ── CTA row ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-black transition-colors duration-150 shadow-sm hover:shadow-md"
        >
          Start Free Trial
          <ArrowRight size={14} />
        </Link>
        <Link
          href="#features"
          className="inline-flex items-center justify-center gap-2 text-gray-600 border border-gray-200 px-6 py-3 rounded-xl font-medium text-sm hover:border-gray-300 hover:bg-gray-50 transition-all duration-150"
        >
          See how it works
        </Link>
      </div>

      {/* ── Mini social proof ── */}
      <div className="flex items-center gap-3 pt-1">
        <div className="flex -space-x-2.5">
          {AVATARS.map((a) => (
            <div
              key={a.initials}
              className={`w-8 h-8 rounded-full ${a.bg} border-2 border-white flex items-center justify-center text-[10px] font-bold text-gray-600 shadow-sm`}
            >
              {a.initials}
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 leading-snug">
          <span className="font-semibold text-gray-900">1,000+</span> agents
          <br className="sm:hidden" /> deployed this month
        </p>
      </div>
    </div>
  );
}
