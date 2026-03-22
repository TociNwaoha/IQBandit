"use client";

/**
 * components/SetupGuide.tsx
 * Numbered step-by-step guide component.
 * Used inside connection setup pages.
 */

export interface GuideStep {
  number: number;
  title: string;
  description: string;
  link?: { label: string; href: string };
}

interface SetupGuideProps {
  steps: GuideStep[];
  /** Step number that is currently active (1-indexed). Steps before this are shown as complete. */
  currentStep: number;
}

export function SetupGuide({ steps, currentStep }: SetupGuideProps) {
  return (
    <div className="space-y-5">
      {steps.map((step) => {
        const isComplete = step.number < currentStep;
        const isActive   = step.number === currentStep;

        return (
          <div key={step.number} className="flex gap-3">
            {/* Circle */}
            <div
              className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${
                isComplete
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                  : isActive
                    ? "bg-blue-500/15 border-blue-500/40 text-blue-400"
                    : ""
              }`}
              style={!isComplete && !isActive ? { background: "var(--color-bg-surface-2)", borderColor: "var(--color-border)", color: "var(--color-text-muted)" } : {}}
            >
              {isComplete ? "✓" : step.number}
            </div>

            {/* Content */}
            <div className="flex-1 pt-0.5 min-w-0">
              <p
                className="text-sm font-medium leading-snug"
                style={{ color: isActive ? "var(--color-text-primary)" : isComplete ? "var(--color-text-secondary)" : "var(--color-text-muted)" }}
              >
                {step.title}
              </p>
              <p
                className="text-xs mt-0.5 leading-relaxed"
                style={{ color: isActive ? "var(--color-text-secondary)" : "var(--color-text-muted)" }}
              >
                {step.description}
              </p>
              {step.link && isActive && (
                <a
                  href={step.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors"
                >
                  {step.link.label} ↗
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
