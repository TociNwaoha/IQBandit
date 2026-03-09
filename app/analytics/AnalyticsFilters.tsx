"use client";

/**
 * app/analytics/AnalyticsFilters.tsx
 * Filter controls for the analytics dashboard.
 * Pushes updated query params to the URL; the server component re-renders.
 * Must be wrapped in <Suspense> by the parent (useSearchParams requirement).
 */

import { useRouter, usePathname, useSearchParams } from "next/navigation";

const INPUT: React.CSSProperties = {
  padding: "5px 8px",
  fontFamily: "monospace",
  fontSize: "12px",
  border: "1px solid #e8e8e4",
  borderRadius: "5px",
  background: "#fff",
  color: "#1a1a17",
  cursor: "pointer",
  outline: "none",
};

export function AnalyticsFilters({
  models,
  currentDays,
  currentModel,
}: {
  /** All distinct model names ever seen in the DB */
  models: string[];
  /** Currently selected days window (number) */
  currentDays: number;
  /** Currently selected model, or "" for all */
  currentModel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const isFiltered = currentModel !== "" || currentDays !== 7;

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: "20px",
      }}
    >
      {/* Time range */}
      <select
        value={String(currentDays)}
        onChange={(e) => update("days", e.target.value)}
        style={INPUT}
        aria-label="Time range"
      >
        <option value="1">Last 24 h</option>
        <option value="7">Last 7 days</option>
        <option value="30">Last 30 days</option>
      </select>

      {/* Model filter */}
      <select
        value={currentModel}
        onChange={(e) => update("model", e.target.value)}
        style={INPUT}
        aria-label="Model filter"
      >
        <option value="">All models</option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      {/* Clear filters — only shown when non-default filters are active */}
      {isFiltered && (
        <button
          onClick={() => router.push(pathname)}
          style={{
            padding: "5px 10px",
            fontFamily: "monospace",
            fontSize: "12px",
            border: "1px solid #e8e8e4",
            borderRadius: "5px",
            background: "transparent",
            color: "#6b6b60",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      )}

      {/* Current filter description */}
      <span style={{ fontSize: "11px", color: "#a8a89c" }}>
        {currentModel ? `model: ${currentModel} · ` : ""}
        {currentDays === 1
          ? "last 24 h"
          : currentDays === 30
          ? "last 30 days"
          : "last 7 days"}
      </span>
    </div>
  );
}
