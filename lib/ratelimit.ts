/**
 * lib/ratelimit.ts
 * Simple in-memory rate limiter for the chat endpoint.
 *
 * What it does:
 *   Tracks how many requests each user has made in the last 60 seconds.
 *   If they exceed the limit, it returns { allowed: false } and the chat
 *   route sends back a 429 "Too Many Requests" response.
 *
 * How it works (sliding window):
 *   Each "key" (user email or IP) gets a slot in a Map.
 *   The slot records how many requests have been made, and when the window resets.
 *   When the window expires, the count resets to 1 for the new request.
 *
 * Limitations (acceptable for MVP):
 *   - In-memory only: rate limits reset if the server restarts.
 *   - Per-process only: if Next.js runs multiple worker processes (e.g. PM2
 *     cluster mode), each process has its own independent limit. The effective
 *     combined limit is RATE_LIMIT × NUM_WORKERS.
 *   - Single-threaded: Node.js is single-threaded, so there's no risk of
 *     race conditions within one process.
 *   If you later need cross-process rate limiting, replace this module with
 *   an Upstash Redis adapter — the exported function signatures stay the same.
 *
 * SERVER-SIDE ONLY — never import this in a "use client" component.
 */

// ---------------------------------------------------------------------------
// Configuration — edit these to change the limits
// ---------------------------------------------------------------------------

/** Maximum number of requests allowed per key per window */
const RATE_LIMIT = 20;

/** Length of the time window in milliseconds (60 seconds) */
const WINDOW_MS = 60_000;

/** How often to sweep and delete expired entries from the Map (5 minutes) */
const CLEANUP_INTERVAL_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface RateRecord {
  /** How many requests this key has made in the current window */
  count: number;
  /** Unix timestamp (ms) when this window expires and count resets */
  resetAt: number;
}

/**
 * The Map that tracks each user's request count.
 * Key = a string like "email:admin@example.com" or "ip:1.2.3.4"
 */
const store = new Map<string, RateRecord>();

// ---------------------------------------------------------------------------
// Login-specific rate limit state
// Stricter limits (10 attempts / 5-minute window) to resist brute-force.
// Uses its own Map so login limits are independent of chat limits.
// ---------------------------------------------------------------------------

/** Maximum login attempts per key per login window */
const LOGIN_RATE_LIMIT = 10;

/** Login window length in milliseconds (5 minutes) */
const LOGIN_WINDOW_MS = 5 * 60_000;

const loginStore = new Map<string, RateRecord>();

// ---------------------------------------------------------------------------
// Cleanup timer
// ---------------------------------------------------------------------------

/**
 * Periodically removes entries whose window has expired.
 * Without this, the Map would grow forever as new users hit the endpoint.
 *
 * IMPORTANT: We call .unref() on the timer.
 * Without .unref(), the setInterval keeps the Node.js event loop alive
 * forever — this causes `next build` and test runners to hang waiting
 * for the timer to fire. .unref() tells Node: "don't keep running just
 * for this timer if everything else is done."
 */
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (record.resetAt <= now) store.delete(key);
  }
  for (const [key, record] of loginStore.entries()) {
    if (record.resetAt <= now) loginStore.delete(key);
  }
}, CLEANUP_INTERVAL_MS);

// Some environments (old Node, Bun, edge runtimes) may not have .unref()
if (typeof cleanupTimer.unref === "function") {
  cleanupTimer.unref();
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  /** true = request is within the limit and should proceed */
  allowed: boolean;
  /**
   * How many milliseconds until the limit resets.
   * Only set when allowed = false.
   * Divide by 1000 and round up to get the Retry-After value in seconds.
   */
  retryAfterMs?: number;
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Checks the rate limit for a given key and increments the counter.
 *
 * Call this once per incoming request, BEFORE doing any expensive work.
 * If allowed = false, return a 429 response immediately.
 *
 * @param key - Identifying string for this user/session. Use getRateLimitKey().
 *
 * Example:
 *   const key = getRateLimitKey(request, session.email);
 *   const rl = checkRateLimit(key);
 *   if (!rl.allowed) {
 *     return NextResponse.json(
 *       { error: "Too many requests", code: "RATE_LIMITED" },
 *       { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs! / 1000)) } }
 *     );
 *   }
 */
export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const record = store.get(key);

  // No record yet, or the previous window has expired → start a new window
  if (!record || record.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  // Within an active window and under the limit → allow and increment
  if (record.count < RATE_LIMIT) {
    // Mutating in place is safe — JS is single-threaded, no race conditions
    record.count += 1;
    return { allowed: true };
  }

  // Limit exceeded → deny the request
  return {
    allowed: false,
    retryAfterMs: record.resetAt - now,
  };
}

/**
 * Checks the login rate limit for a given key (IP-based) and increments the counter.
 * Stricter than checkRateLimit: 10 attempts per 5-minute window.
 * Use this on the login endpoint to resist brute-force attacks.
 *
 * @param key - Identifying string for this IP. Example: "login:1.2.3.4"
 */
export function checkLoginRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const record = loginStore.get(key);

  if (!record || record.resetAt <= now) {
    loginStore.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true };
  }

  if (record.count < LOGIN_RATE_LIMIT) {
    record.count += 1;
    return { allowed: true };
  }

  return {
    allowed: false,
    retryAfterMs: record.resetAt - now,
  };
}

/**
 * Builds the rate limit key for a given request.
 *
 * Prefers session email (authenticated identity, cannot be spoofed)
 * over IP address (which can be shared by NAT or faked via X-Forwarded-For).
 *
 * @param request - The incoming NextRequest (only needs the .headers getter)
 * @param email   - Session email if the user is authenticated, or null
 */
export function getRateLimitKey(
  request: { headers: { get(name: string): string | null } },
  email: string | null
): string {
  // Authenticated user — most specific and reliable key
  if (email) {
    return `email:${email}`;
  }

  // IP fallback — X-Forwarded-For can contain a chain like "client, proxy1, proxy2"
  // We only take the first address (the original client IP)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return `ip:${forwarded.split(",")[0].trim()}`;
  }

  // Unknown — all anonymous requests share one bucket.
  // In practice, the chat route always requires a session, so email is never null.
  return "ip:unknown";
}
