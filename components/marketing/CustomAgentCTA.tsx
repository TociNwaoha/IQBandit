import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function CustomAgentCTA() {
  return (
    <section className="max-w-6xl mx-auto px-4 py-20">
      <div className="bg-gray-900 rounded-3xl px-8 sm:px-16 py-16 sm:py-20 text-center relative overflow-hidden">
        {/* Decorative glow — pure Tailwind, no images */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-64 rounded-full opacity-10 blur-3xl bg-white pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 space-y-6">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
            Ready to launch?
          </span>

          <h2 className="text-3xl sm:text-5xl font-bold text-white leading-tight tracking-tight">
            Build your first agent
            <br />
            in under 5 minutes.
          </h2>

          <p className="text-gray-400 text-base sm:text-lg max-w-xl mx-auto leading-relaxed">
            No infrastructure. No ops. Pick your model, connect a channel, and
            go live today.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 bg-white text-gray-900 px-7 py-3.5 rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors"
            >
              Start for free
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center text-gray-400 border border-gray-700 px-7 py-3.5 rounded-xl font-medium text-sm hover:bg-gray-800 hover:text-white transition-colors"
            >
              Read the docs
            </Link>
          </div>

          {/* Trust note */}
          <p className="text-xs text-gray-600 pt-1">
            No credit card required · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
}
