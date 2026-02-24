/**
 * app/onboarding/page.tsx
 * Server Component — shown after first login.
 * Extend this with real onboarding steps as the product grows.
 */

import Link from "next/link";
import { getSessionFromCookies } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OnboardingPage() {
  // Double-check session server-side (middleware already guards this route)
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const steps = [
    {
      id: 1,
      title: "Gateway connected",
      description: "Your OpenClaw gateway is proxied through the server.",
      done: true,
    },
    {
      id: 2,
      title: "Configure your first model",
      description: "Set up a model alias in the gateway config.",
      done: false,
    },
    {
      id: 3,
      title: "Build your first workflow",
      description: "Chain prompts and tools together to automate a task.",
      done: false,
    },
    {
      id: 4,
      title: "Invite your team",
      description: "Add additional users when multi-user auth is ready.",
      done: false,
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100 px-4 py-16">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <span className="inline-block text-xs font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1 mb-4">
            Getting started
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Welcome to IQBANDIT
          </h1>
          <p className="text-zinc-400 mt-2">
            Complete these steps to get your gateway running.
          </p>
        </div>

        {/* Steps */}
        <ol className="space-y-3">
          {steps.map((step) => (
            <li
              key={step.id}
              className={`flex items-start gap-4 rounded-xl border p-5 transition-colors ${
                step.done
                  ? "bg-zinc-900/40 border-zinc-800"
                  : "bg-zinc-900/20 border-zinc-800/50"
              }`}
            >
              {/* Step indicator */}
              <div
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.done
                    ? "bg-violet-500 text-white"
                    : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {step.done ? (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  step.id
                )}
              </div>

              <div>
                <p
                  className={`text-sm font-medium ${
                    step.done ? "text-zinc-300" : "text-zinc-100"
                  }`}
                >
                  {step.title}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* CTA */}
        <div className="mt-8 flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors"
          >
            Go to dashboard
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
          <span className="text-xs text-zinc-600">
            You can always come back here from the settings menu.
          </span>
        </div>
      </div>
    </div>
  );
}
