"use client";

/**
 * app/onboarding/page.tsx
 * 4-step onboarding flow. Dark theme.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = 1 | 2 | 3 | 4;

const USE_CASES = [
  { id: "social",     emoji: "📱", title: "Social Media Management" },
  { id: "research",   emoji: "🔍", title: "Research & Analysis" },
  { id: "email",      emoji: "📧", title: "Email & Productivity" },
  { id: "influencer", emoji: "🤝", title: "Influencer Outreach" },
  { id: "business",   emoji: "💼", title: "Business Automation" },
  { id: "other",      emoji: "✨", title: "Something Else" },
] as const;

type UseCaseId = (typeof USE_CASES)[number]["id"];

const PLANS = [
  {
    id:       "free" as const,
    label:    "Free",
    price:    "$0/mo",
    features: ["Research Agent", "512MB RAM", "5GB storage"],
  },
  {
    id:       "starter" as const,
    label:    "Starter",
    price:    "$9.99/mo",
    popular:  true as const,
    features: ["All agents", "X posting", "2GB RAM · 40GB storage"],
  },
  {
    id:       "pro" as const,
    label:    "Pro",
    price:    "$19.99/mo",
    features: ["Everything in Starter", "4GB RAM · 80GB storage", "Browser agent"],
  },
  {
    id:       "bandit_plus" as const,
    label:    "Bandit Plus",
    price:    "$39.99/mo",
    features: ["Everything in Pro", "6GB RAM · 160GB storage", "Early access"],
  },
];

type PlanId = "free" | "starter" | "pro" | "bandit_plus";

function ProgressDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {([1, 2, 3, 4] as const).map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full transition-all ${
              s === step ? "bg-blue-400 scale-125" : s < step ? "bg-blue-600" : "bg-zinc-700"
            }`}
          />
          {s < 4 && <div className={`h-px w-8 ${s < step ? "bg-blue-600" : "bg-zinc-700"}`} />}
        </div>
      ))}
      <span className="text-xs text-zinc-500 ml-2">Step {step} of 4</span>
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();

  const [step,      setStep]      = useState<Step>(1);
  const [name,      setName]      = useState("");
  const [useCase,   setUseCase]   = useState<UseCaseId | null>(null);
  const [agentName, setAgentName] = useState("");
  const [planId,    setPlanId]    = useState<PlanId>("free");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const selectedUseCase = USE_CASES.find((u) => u.id === useCase);
  const useCaseLabel    = selectedUseCase?.title ?? "your goals";

  function next() {
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }

  async function handleFinish() {
    setError(null);
    setLoading(true);

    try {
      const res  = await fetch("/api/auth/onboarding", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:      name.trim(),
          useCase:   useCase ?? "other",
          agentName: agentName.trim() || "Bandit",
          planId,
        }),
      });
      const data = await res.json() as {
        success?: boolean;
        error?: string;
        requiresPayment?: boolean;
        planId?: string;
      };

      if (!res.ok || !data.success) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      if (data.requiresPayment && data.planId) {
        const interval     = typeof sessionStorage !== "undefined"
          ? (sessionStorage.getItem("signup_interval") ?? "monthly")
          : "monthly";
        const checkoutRes  = await fetch("/api/billing/checkout", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ planId: data.planId, interval }),
        });
        const checkoutData = await checkoutRes.json() as { url?: string; error?: string };
        if (checkoutData.url) {
          window.location.href = checkoutData.url;
          return;
        }
        setError(checkoutData.error ?? "Failed to start checkout");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-zinc-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-10">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <span className="text-blue-400 text-[10px] font-bold">IQ</span>
          </div>
          <span className="text-sm font-semibold text-zinc-200">IQBANDIT</span>
        </div>

        <ProgressDots step={step} />

        {/* Step 1 — Name */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-1">Welcome to IQBandit 👋</h1>
              <p className="text-sm text-zinc-500">What should we call you?</p>
            </div>
            <input
              type="text" autoFocus value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-4 py-3 text-zinc-100 text-base placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-colors"
            />
            <button
              onClick={next} disabled={name.trim().length < 2}
              className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 2 — Use case */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-1">What will you use IQBandit for?</h1>
              <p className="text-sm text-zinc-500">Choose what fits best — you can always change this.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {USE_CASES.map((uc) => (
                <button
                  key={uc.id} onClick={() => setUseCase(uc.id)}
                  className={`text-left px-4 py-4 rounded-xl border transition-all ${
                    useCase === uc.id
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                  }`}
                >
                  <span className="text-2xl mb-2 block">{uc.emoji}</span>
                  <span className="text-sm font-medium text-zinc-200">{uc.title}</span>
                </button>
              ))}
            </div>
            <button
              onClick={next} disabled={!useCase}
              className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 3 — Agent name */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-1">Give your AI agent a name</h1>
              <p className="text-sm text-zinc-500">This is how your agent will introduce itself.</p>
            </div>
            <input
              type="text" autoFocus value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. Max, Aria, Nova, Bandit…"
              className="w-full bg-zinc-900 border border-zinc-700/60 rounded-xl px-4 py-3 text-zinc-100 text-base placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-colors"
            />
            {agentName.trim() && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <p className="text-sm text-zinc-400 italic">
                  &ldquo;Hi, I&apos;m{" "}
                  <span className="text-zinc-200 not-italic font-medium">{agentName.trim()}</span>
                  . I&apos;m ready to help you with{" "}
                  <span className="text-zinc-200 not-italic font-medium">{useCaseLabel}</span>.&rdquo;
                </p>
              </div>
            )}
            <button
              onClick={next}
              className="self-start inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step 4 — Plan */}
        {step === 4 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-1">Choose how you want to start</h1>
              <p className="text-sm text-zinc-500">You can upgrade at any time from your dashboard.</p>
            </div>

            <div className="flex flex-col gap-3">
              {PLANS.map((plan) => (
                <button
                  key={plan.id} onClick={() => setPlanId(plan.id)}
                  className={`text-left px-4 py-4 rounded-xl border transition-all relative ${
                    planId === plan.id
                      ? "border-blue-500 bg-blue-500/10"
                      : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                  }`}
                >
                  {"popular" in plan && (
                    <span className="absolute -top-2.5 right-4 bg-blue-600 text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">{plan.label}</p>
                      <ul className="mt-1.5 flex flex-col gap-0.5">
                        {plan.features.map((f) => (
                          <li key={f} className="text-xs text-zinc-500">{f}</li>
                        ))}
                      </ul>
                    </div>
                    <span className="text-sm font-semibold text-zinc-300 whitespace-nowrap">{plan.price}</span>
                  </div>
                </button>
              ))}
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}

            <button
              onClick={() => void handleFinish()}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Setting up your agent…
                </>
              ) : "Get Started →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
