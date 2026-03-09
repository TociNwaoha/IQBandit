/**
 * lib/analytics.ts
 * Read-only aggregate analytics over the chat_requests table.
 * Opens the same logs/requests.db written by lib/logger.ts.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import fs from "fs";
import path from "path";

// ─── types ────────────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  /** Total request count within the filter window */
  total_requests: number;
  /** Successful request count (success=1) */
  success_count: number;
  /** Failed request count (success=0) */
  error_count: number;
  /** Success percentage, 0–100, rounded to 1 decimal */
  success_rate: number;
  /** Average latency in ms, rounded to nearest integer */
  avg_latency_ms: number;
  /** Model with the most requests in the window. Empty string if no data. */
  most_used_model: string;
}

export interface DailyBucket {
  /** "YYYY-MM-DD" UTC (ISO-8601 timestamps bucketed via strftime) */
  date: string;
  requests: number;
  errors: number;
  /** Average latency in ms for this day, rounded to nearest integer */
  avg_latency_ms: number;
}

export interface ModelStat {
  model: string;
  requests: number;
  success_rate: number;
  avg_latency_ms: number;
}

export interface ErrorBucket {
  /** Heuristic category derived from error_message text */
  error_type: string;
  count: number;
}

// ─── db setup ─────────────────────────────────────────────────────────────────

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const DB_PATH = path.join(LOGS_DIR, "requests.db");

type BetterSQLiteDB = import("better-sqlite3").Database;

/**
 * Opens the existing DB read-only.
 * Returns null if the DB file doesn't exist yet or better-sqlite3 is unavailable.
 * Read-only mode: we never write from analytics — no risk of WAL conflicts.
 */
function tryOpenDB(): BetterSQLiteDB | null {
  try {
    if (!fs.existsSync(DB_PATH)) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    // readonly: true — safe for concurrent reads, no locking overhead
    const db: BetterSQLiteDB = new Database(DB_PATH, { readonly: true });
    return db;
  } catch {
    return null;
  }
}

const db: BetterSQLiteDB | null = tryOpenDB();

// ─── internal helpers ─────────────────────────────────────────────────────────

/**
 * Builds a WHERE clause from optional filter params.
 * Fixed conditions (no params) go first; parameterized ones follow so that
 * the returned `params` array aligns with `?` placeholders left-to-right.
 *
 * @param days      - number of trailing days to include; omit for all time
 * @param model     - exact model name to match; omit for all models
 * @param extraConds - additional fixed SQL conditions (no params), e.g. ["success=0"]
 */
function buildWhere(
  days?: number,
  model?: string,
  extraConds: string[] = []
): { sql: string; params: unknown[] } {
  const conds: string[] = [...extraConds];
  const params: unknown[] = [];
  if (days) {
    conds.push("timestamp >= datetime('now', ?)");
    params.push(`-${days} days`);
  }
  if (model) {
    conds.push("model = ?");
    params.push(model);
  }
  return {
    sql: conds.length ? "WHERE " + conds.join(" AND ") : "",
    params,
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Returns aggregate KPI metrics.
 *
 * @param days  - trailing window in days (e.g. 7 = last 7 days). Omit for all time.
 * @param model - restrict to a single model. Omit for all models.
 */
export function getAnalyticsSummary(
  days?: number,
  model?: string
): AnalyticsSummary {
  const empty: AnalyticsSummary = {
    total_requests: 0,
    success_count: 0,
    error_count: 0,
    success_rate: 0,
    avg_latency_ms: 0,
    most_used_model: "",
  };
  if (!db) return empty;

  try {
    type SummaryRow = {
      total_requests: number;
      success_count: number;
      error_count: number;
      success_rate: number;
      avg_latency_ms: number;
    };

    const { sql: whereSql, params: whereParams } = buildWhere(days, model);

    const row = db
      .prepare(
        `SELECT
           COUNT(*)                                                  AS total_requests,
           SUM(CASE WHEN success=1 THEN 1 ELSE 0 END)               AS success_count,
           SUM(CASE WHEN success=0 THEN 1 ELSE 0 END)               AS error_count,
           ROUND(AVG(CASE WHEN success=1 THEN 100.0 ELSE 0.0 END), 1) AS success_rate,
           CAST(ROUND(AVG(latency_ms)) AS INTEGER)                  AS avg_latency_ms
         FROM chat_requests
         ${whereSql}`
      )
      .get(...whereParams) as SummaryRow | undefined;

    const modelRow = db
      .prepare(
        `SELECT model
         FROM chat_requests
         ${whereSql}
         GROUP BY model
         ORDER BY COUNT(*) DESC
         LIMIT 1`
      )
      .get(...whereParams) as { model: string } | undefined;

    if (!row) return empty;

    return {
      total_requests: row.total_requests ?? 0,
      success_count: row.success_count ?? 0,
      error_count: row.error_count ?? 0,
      success_rate: row.success_rate ?? 0,
      avg_latency_ms: row.avg_latency_ms ?? 0,
      most_used_model: modelRow?.model ?? "",
    };
  } catch {
    return empty;
  }
}

/**
 * Returns one bucket per calendar day for the last `days` days (default 7).
 * Days with no requests are omitted (SQLite GROUP BY only returns existing rows).
 * Results are sorted oldest → newest.
 *
 * Time bucketing: strftime('%Y-%m-%d', timestamp) — uses UTC from ISO-8601
 * timestamps stored by lib/logger.ts. All dates are UTC — consistent across
 * server timezone changes.
 *
 * @param days  - trailing window in days. Default 7.
 * @param model - restrict to a single model. Omit for all models.
 */
export function getTimeseries(days = 7, model?: string): DailyBucket[] {
  if (!db) return [];
  try {
    const modifier = `-${days} days`;
    const params: unknown[] = [modifier];
    let modelFilter = "";
    if (model) {
      modelFilter = "AND model = ?";
      params.push(model);
    }
    return db
      .prepare(
        `SELECT
           strftime('%Y-%m-%d', timestamp)                  AS date,
           COUNT(*)                                          AS requests,
           SUM(CASE WHEN success=0 THEN 1 ELSE 0 END)       AS errors,
           CAST(ROUND(AVG(latency_ms)) AS INTEGER)           AS avg_latency_ms
         FROM chat_requests
         WHERE timestamp >= datetime('now', ?)
         ${modelFilter}
         GROUP BY strftime('%Y-%m-%d', timestamp)
         ORDER BY date ASC`
      )
      .all(...params) as DailyBucket[];
  } catch {
    return [];
  }
}

/**
 * Returns per-model aggregate stats sorted by request count descending.
 *
 * @param days - trailing window in days. Omit for all time.
 */
export function getModelStats(days?: number): ModelStat[] {
  if (!db) return [];
  try {
    const { sql: whereSql, params: whereParams } = buildWhere(days);
    return db
      .prepare(
        `SELECT
           model,
           COUNT(*)                                                     AS requests,
           ROUND(AVG(CASE WHEN success=1 THEN 100.0 ELSE 0.0 END), 1)  AS success_rate,
           CAST(ROUND(AVG(latency_ms)) AS INTEGER)                      AS avg_latency_ms
         FROM chat_requests
         ${whereSql}
         GROUP BY model
         ORDER BY requests DESC
         LIMIT 10`
      )
      .all(...whereParams) as ModelStat[];
  } catch {
    return [];
  }
}

/**
 * Returns all distinct model names ever seen in the DB, sorted alphabetically.
 * Always unfiltered — used to populate the model picker dropdown.
 */
export function getDistinctModels(): string[] {
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT model FROM chat_requests ORDER BY model ASC`
      )
      .all() as { model: string }[];
    return rows.map((r) => r.model);
  } catch {
    return [];
  }
}

/**
 * Returns a breakdown of failed requests by error category.
 * Categories are derived from heuristic CASE/LIKE matching on `error_message`.
 *
 * Categories (in match priority order):
 *   Timeout     — timeout / TimeoutError / timed out
 *   Unreachable — ECONNREFUSED / ENOTFOUND / ECONNRESET / not reachable
 *   Auth        — auth / 401 / 403 / unauthorized / forbidden
 *   Endpoint    — 404 / not found / endpoint
 *   Disabled    — disabled
 *   Other       — everything else
 *
 * @param days  - trailing window in days. Omit for all time.
 * @param model - restrict to a single model. Omit for all models.
 */
export function getErrorBreakdown(
  days?: number,
  model?: string
): ErrorBucket[] {
  if (!db) return [];
  try {
    // success=0 is a fixed condition (no param); days/model params follow
    const { sql: whereSql, params: whereParams } = buildWhere(days, model, [
      "success=0",
    ]);
    return db
      .prepare(
        `SELECT
           CASE
             WHEN error_message LIKE '%timeout%'
               OR error_message LIKE '%TimeoutError%'
               OR error_message LIKE '%timed out%'
               THEN 'Timeout'
             WHEN error_message LIKE '%ECONNREFUSED%'
               OR error_message LIKE '%not reachable%'
               OR error_message LIKE '%ENOTFOUND%'
               OR error_message LIKE '%ECONNRESET%'
               THEN 'Unreachable'
             WHEN error_message LIKE '%auth%'
               OR error_message LIKE '%401%'
               OR error_message LIKE '%403%'
               OR error_message LIKE '%unauthorized%'
               OR error_message LIKE '%forbidden%'
               THEN 'Auth'
             WHEN error_message LIKE '%404%'
               OR error_message LIKE '%not found%'
               OR error_message LIKE '%endpoint%'
               THEN 'Endpoint'
             WHEN error_message LIKE '%disabled%'
               THEN 'Disabled'
             ELSE 'Other'
           END AS error_type,
           COUNT(*) AS count
         FROM chat_requests
         ${whereSql}
         GROUP BY error_type
         ORDER BY count DESC`
      )
      .all(...whereParams) as ErrorBucket[];
  } catch {
    return [];
  }
}
