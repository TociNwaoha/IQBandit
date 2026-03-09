/**
 * app/analytics/page.tsx
 * Protected server component — analytics dashboard over chat_requests.
 * Supports ?days=1|7|30 and ?model=<name> query params for filtering.
 */

import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";
import {
  getAnalyticsSummary,
  getTimeseries,
  getModelStats,
  getDistinctModels,
  getErrorBreakdown,
} from "@/lib/analytics";
import { AnalyticsFilters } from "./AnalyticsFilters";

// ─── sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "neutral";
  href?: string;
}) {
  const accentColor =
    accent === "green" ? "#166534" : accent === "red" ? "#991b1b" : "#1a1a17";

  const body = (
    <>
      <div
        style={{
          fontSize: "11px",
          color: "#6b6b60",
          marginBottom: "6px",
          letterSpacing: "0.04em",
        }}
      >
        {label.toUpperCase()}
      </div>
      <div
        style={{
          fontSize: "26px",
          fontWeight: 700,
          color: accentColor,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "11px", color: "#6b6b60", marginTop: "4px" }}>
          {sub}
        </div>
      )}
      {href && (
        <div style={{ fontSize: "10px", color: "#a8a89c", marginTop: "6px" }}>
          View logs →
        </div>
      )}
    </>
  );

  const cardStyle: React.CSSProperties = {
    flex: "1 1 160px",
    minWidth: "140px",
    border: "1px solid #e8e8e4",
    borderRadius: "6px",
    padding: "16px 18px",
    background: "#fafaf8",
    display: "block",
    textDecoration: "none",
    color: "inherit",
  };

  return href ? (
    <a href={href} style={cardStyle}>
      {body}
    </a>
  ) : (
    <div style={cardStyle}>{body}</div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; model?: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/login");

  const sp = await searchParams;

  // Parse days — default 7, clamped to 1–30
  const rawDays = Number(sp.days ?? "7");
  const days = Number.isNaN(rawDays) ? 7 : Math.min(30, Math.max(1, rawDays));

  // Parse model — undefined means "all models"
  const model = sp.model?.trim() || undefined;

  // Fetch all data (better-sqlite3 is synchronous)
  const summary = getAnalyticsSummary(days, model);
  const timeseries = getTimeseries(days, model);
  const modelStats = getModelStats(days);
  const allModels = getDistinctModels();
  const errorBreakdown = getErrorBreakdown(days, model);

  const noData = summary.total_requests === 0 && allModels.length === 0;
  const noDataInWindow = summary.total_requests === 0 && allModels.length > 0;

  const maxRequests = timeseries.reduce((m, d) => Math.max(m, d.requests), 1);

  const windowLabel =
    days === 1 ? "24 h" : days === 30 ? "30 days" : "7 days";

  const logsBase = "/logs";

  return (
    <main
      style={{
        padding: "24px",
        fontFamily: "monospace",
        fontSize: "13px",
        color: "#1a1a17",
        maxWidth: "900px",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
          marginBottom: "4px",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
          Analytics
        </h1>
        <a
          href={logsBase}
          style={{ fontSize: "11px", color: "#6b6b60", textDecoration: "none" }}
        >
          View all logs →
        </a>
      </div>
      <p style={{ marginBottom: "20px", color: "#6b6b60" }}>
        Metrics from <code>logs/requests.db</code>
        {model ? (
          <>
            {" "}· model: <code>{model}</code>
          </>
        ) : null}
      </p>

      {/* ── Filter controls (client component — needs Suspense) ── */}
      <Suspense fallback={<div style={{ height: "32px", marginBottom: "20px" }} />}>
        <AnalyticsFilters
          models={allModels}
          currentDays={days}
          currentModel={model ?? ""}
        />
      </Suspense>

      {/* ── Content ── */}
      {noData ? (
        <p style={{ color: "#6b6b60" }}>
          No data yet. Send a chat message to generate logs.
        </p>
      ) : noDataInWindow ? (
        <p style={{ color: "#6b6b60" }}>
          No requests in the last {windowLabel}
          {model ? ` for model "${model}"` : ""}.{" "}
          <a href="/analytics" style={{ color: "#6b6b60" }}>
            Clear filters
          </a>
        </p>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
              marginBottom: "32px",
            }}
          >
            <KpiCard
              label="Total Requests"
              value={summary.total_requests.toLocaleString()}
              sub={`last ${windowLabel}`}
              href={logsBase}
            />
            <KpiCard
              label="Success Rate"
              value={`${summary.success_rate}%`}
              sub={`${summary.success_count} ok / ${summary.error_count} err`}
              accent={
                summary.success_rate >= 95
                  ? "green"
                  : summary.success_rate < 80
                  ? "red"
                  : "neutral"
              }
            />
            <KpiCard
              label="Avg Latency"
              value={`${summary.avg_latency_ms} ms`}
              accent={
                summary.avg_latency_ms < 2000
                  ? "green"
                  : summary.avg_latency_ms > 10000
                  ? "red"
                  : "neutral"
              }
            />
            <KpiCard
              label="Errors"
              value={
                summary.total_requests > 0
                  ? `${(100 - summary.success_rate).toFixed(1)}%`
                  : "0%"
              }
              sub={`${summary.error_count} failed`}
              accent={summary.error_count === 0 ? "green" : "red"}
              href={summary.error_count > 0 ? `${logsBase}?success=0` : undefined}
            />
            <KpiCard
              label="Top Model"
              value={summary.most_used_model || "—"}
              href={
                summary.most_used_model
                  ? `${logsBase}?model=${encodeURIComponent(summary.most_used_model)}`
                  : undefined
              }
            />
          </div>

          {/* ── Timeseries ── */}
          <h2
            style={{ fontSize: "13px", fontWeight: 600, marginBottom: "12px" }}
          >
            Last {windowLabel}
          </h2>

          {timeseries.length === 0 ? (
            <p style={{ color: "#6b6b60", marginBottom: "32px" }}>
              No requests in this window.
            </p>
          ) : (
            <div style={{ overflowX: "auto", marginBottom: "32px" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  minWidth: "500px",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "2px solid #e8e8e4" }}>
                    {[
                      "date",
                      "requests",
                      "errors",
                      "avg latency (ms)",
                      "volume",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: "6px 10px",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeseries.map((row, i) => {
                    const barPct = Math.round(
                      (row.requests / maxRequests) * 100
                    );
                    const hasErrors = row.errors > 0;
                    return (
                      <tr
                        key={row.date}
                        style={{
                          background: i % 2 === 0 ? "#f7f7f4" : "#fff",
                        }}
                      >
                        <td
                          style={{
                            padding: "5px 10px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.date}
                        </td>
                        <td
                          style={{ padding: "5px 10px", textAlign: "right" }}
                        >
                          {row.requests}
                        </td>
                        <td
                          style={{
                            padding: "5px 10px",
                            textAlign: "right",
                            color: hasErrors ? "#991b1b" : "#166534",
                            fontWeight: hasErrors ? 600 : 400,
                          }}
                        >
                          {row.errors}
                        </td>
                        <td
                          style={{ padding: "5px 10px", textAlign: "right" }}
                        >
                          {row.avg_latency_ms}
                        </td>
                        <td
                          style={{ padding: "5px 10px", minWidth: "120px" }}
                        >
                          <div
                            style={{
                              background: "#e8e8e4",
                              borderRadius: "2px",
                              height: "10px",
                              width: "120px",
                            }}
                          >
                            <div
                              style={{
                                background: hasErrors ? "#f87171" : "#4ade80",
                                borderRadius: "2px",
                                height: "10px",
                                width: `${barPct}%`,
                                minWidth: barPct > 0 ? "2px" : "0",
                              }}
                            />
                          </div>
                        </td>
                        <td style={{ padding: "5px 10px" }}>
                          <a
                            href={`${logsBase}?date=${row.date}`}
                            style={{
                              fontSize: "11px",
                              color: "#a8a89c",
                              textDecoration: "none",
                            }}
                          >
                            logs →
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Per-Model Stats ── */}
          {modelStats.length > 0 && (
            <>
              <h2
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "12px",
                }}
              >
                By Model{" "}
                <span style={{ fontWeight: 400, color: "#6b6b60" }}>
                  (last {windowLabel})
                </span>
              </h2>
              <div style={{ overflowX: "auto", marginBottom: "32px" }}>
                <table
                  style={{
                    borderCollapse: "collapse",
                    width: "100%",
                    minWidth: "400px",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e8e8e4" }}>
                      {["model", "requests", "success rate", "avg latency (ms)", ""].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              padding: "6px 10px",
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {modelStats.map((m, i) => (
                      <tr
                        key={m.model}
                        style={{
                          background: i % 2 === 0 ? "#f7f7f4" : "#fff",
                        }}
                      >
                        <td style={{ padding: "5px 10px" }}>{m.model}</td>
                        <td
                          style={{ padding: "5px 10px", textAlign: "right" }}
                        >
                          {m.requests}
                        </td>
                        <td
                          style={{
                            padding: "5px 10px",
                            textAlign: "right",
                            color:
                              m.success_rate >= 95
                                ? "#166534"
                                : m.success_rate < 80
                                ? "#991b1b"
                                : "#1a1a17",
                            fontWeight: 600,
                          }}
                        >
                          {m.success_rate}%
                        </td>
                        <td
                          style={{ padding: "5px 10px", textAlign: "right" }}
                        >
                          {m.avg_latency_ms}
                        </td>
                        <td style={{ padding: "5px 10px" }}>
                          <a
                            href={`${logsBase}?model=${encodeURIComponent(m.model)}`}
                            style={{
                              fontSize: "11px",
                              color: "#a8a89c",
                              textDecoration: "none",
                            }}
                          >
                            logs →
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Error Breakdown ── */}
          {errorBreakdown.length > 0 && (
            <>
              <h2
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                Error Breakdown{" "}
                <span style={{ fontWeight: 400, color: "#6b6b60" }}>
                  (last {windowLabel}
                  {model ? ` · ${model}` : ""})
                </span>
              </h2>
              <p
                style={{
                  fontSize: "11px",
                  color: "#a8a89c",
                  marginBottom: "12px",
                }}
              >
                Categories derived from error_message text — heuristic
                grouping, not exhaustive.
              </p>
              <div style={{ overflowX: "auto", marginBottom: "24px" }}>
                <table
                  style={{
                    borderCollapse: "collapse",
                    width: "100%",
                    minWidth: "320px",
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e8e8e4" }}>
                      {["error type", "count", "share", ""].map((h) => (
                        <th
                          key={h}
                          style={{
                            textAlign: "left",
                            padding: "6px 10px",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const totalErrors = errorBreakdown.reduce(
                        (s, e) => s + e.count,
                        0
                      );
                      return errorBreakdown.map((e, i) => {
                        const sharePct =
                          totalErrors > 0
                            ? ((e.count / totalErrors) * 100).toFixed(0)
                            : "0";
                        const barW = Math.round(
                          (e.count / totalErrors) * 100
                        );
                        return (
                          <tr
                            key={e.error_type}
                            style={{
                              background: i % 2 === 0 ? "#f7f7f4" : "#fff",
                            }}
                          >
                            <td
                              style={{
                                padding: "5px 10px",
                                fontWeight: 600,
                                color: "#991b1b",
                              }}
                            >
                              {e.error_type}
                            </td>
                            <td
                              style={{
                                padding: "5px 10px",
                                textAlign: "right",
                              }}
                            >
                              {e.count}
                            </td>
                            <td
                              style={{
                                padding: "5px 10px",
                                minWidth: "120px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <div
                                  style={{
                                    background: "#e8e8e4",
                                    borderRadius: "2px",
                                    height: "8px",
                                    width: "80px",
                                    flexShrink: 0,
                                  }}
                                >
                                  <div
                                    style={{
                                      background: "#f87171",
                                      borderRadius: "2px",
                                      height: "8px",
                                      width: `${barW}%`,
                                      minWidth: barW > 0 ? "2px" : "0",
                                    }}
                                  />
                                </div>
                                <span
                                  style={{ fontSize: "11px", color: "#6b6b60" }}
                                >
                                  {sharePct}%
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: "5px 10px" }}>
                              <a
                                href={`${logsBase}?success=0`}
                                style={{
                                  fontSize: "11px",
                                  color: "#a8a89c",
                                  textDecoration: "none",
                                }}
                              >
                                logs →
                              </a>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
