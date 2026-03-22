/**
 * lib/billing.ts
 * Stripe billing persistence — user_billing SQLite table.
 * Uses the same requests.db as lib/instances.ts.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import fs from "fs";
import path from "path";
import { stripe } from "@/lib/stripe";

// ─── db setup ─────────────────────────────────────────────────────────────────

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const DB_PATH  = path.join(LOGS_DIR, "requests.db");

type BetterSQLiteDB = import("better-sqlite3").Database;

function tryOpenDB(): BetterSQLiteDB | null {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db: BetterSQLiteDB = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    // Log existing tables
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    console.log("[billing] DB tables:", tables.map((t) => t.name).join(", "));

    // Create user_billing table (JWT-based auth — no users table)
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_billing (
        user_id             TEXT PRIMARY KEY,
        email               TEXT,
        stripe_customer_id  TEXT,
        plan                TEXT NOT NULL DEFAULT 'free',
        plan_interval       TEXT,
        subscription_id     TEXT,
        subscription_status TEXT,
        current_period_end  TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_billing_customer
        ON user_billing(stripe_customer_id);
    `);

    // Safe migration: add plan column to instances table if missing
    try {
      db.exec(`ALTER TABLE instances ADD COLUMN plan TEXT DEFAULT 'free'`);
    } catch {
      // Column already exists — safe to ignore
    }

    return db;
  } catch (err) {
    console.error("[billing] Failed to open DB:", err);
    return null;
  }
}

const db = tryOpenDB();

// ─── types ────────────────────────────────────────────────────────────────────

export interface UserBilling {
  user_id: string;
  email: string | null;
  stripe_customer_id: string | null;
  plan: string;
  plan_interval: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillingUpdateData {
  email?: string;
  stripeCustomerId?: string;
  plan?: string;
  planInterval?: string | null;
  subscriptionId?: string | null;
  subscriptionStatus?: string;
  currentPeriodEnd?: string | null;
}

// ─── queries ──────────────────────────────────────────────────────────────────

/** Returns the billing row for a user, or null if none exists. */
export function getUserBilling(userId: string): UserBilling | null {
  if (!db) return null;
  return (
    db
      .prepare("SELECT * FROM user_billing WHERE user_id = ?")
      .get(userId) as UserBilling | undefined
  ) ?? null;
}

/** Looks up a billing row by Stripe customer ID. */
export function getUserBillingByCustomerId(
  stripeCustomerId: string
): UserBilling | null {
  if (!db) return null;
  return (
    db
      .prepare("SELECT * FROM user_billing WHERE stripe_customer_id = ?")
      .get(stripeCustomerId) as UserBilling | undefined
  ) ?? null;
}

/**
 * Upsert billing data for a user.
 * Creates the row if it doesn't exist; updates only provided fields otherwise.
 */
export function updateUserBilling(
  userId: string,
  data: BillingUpdateData
): void {
  if (!db) return;
  const now = new Date().toISOString();

  const existing = db
    .prepare("SELECT user_id FROM user_billing WHERE user_id = ?")
    .get(userId);

  if (!existing) {
    db.prepare(`
      INSERT INTO user_billing
        (user_id, email, stripe_customer_id, plan, plan_interval,
         subscription_id, subscription_status, current_period_end, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      data.email ?? null,
      data.stripeCustomerId ?? null,
      data.plan ?? "free",
      data.planInterval ?? null,
      data.subscriptionId ?? null,
      data.subscriptionStatus ?? null,
      data.currentPeriodEnd ?? null,
      now
    );
    return;
  }

  // Build dynamic UPDATE only for provided fields
  const setClauses: string[] = ["updated_at = @updated_at"];
  const params: Record<string, unknown> = { user_id: userId, updated_at: now };

  if (data.email !== undefined) {
    setClauses.push("email = @email");
    params.email = data.email;
  }
  if (data.stripeCustomerId !== undefined) {
    setClauses.push("stripe_customer_id = @stripe_customer_id");
    params.stripe_customer_id = data.stripeCustomerId;
  }
  if (data.plan !== undefined) {
    setClauses.push("plan = @plan");
    params.plan = data.plan;
  }
  if (data.planInterval !== undefined) {
    setClauses.push("plan_interval = @plan_interval");
    params.plan_interval = data.planInterval;
  }
  if (data.subscriptionId !== undefined) {
    setClauses.push("subscription_id = @subscription_id");
    params.subscription_id = data.subscriptionId;
  }
  if (data.subscriptionStatus !== undefined) {
    setClauses.push("subscription_status = @subscription_status");
    params.subscription_status = data.subscriptionStatus;
  }
  if (data.currentPeriodEnd !== undefined) {
    setClauses.push("current_period_end = @current_period_end");
    params.current_period_end = data.currentPeriodEnd;
  }

  db.prepare(
    `UPDATE user_billing SET ${setClauses.join(", ")} WHERE user_id = @user_id`
  ).run(params);
}

// ─── Stripe customer ──────────────────────────────────────────────────────────

/**
 * Returns an existing Stripe customer ID for the user, or creates a new one.
 * Saves the customer ID to SQLite for future lookups.
 */
export async function createOrGetStripeCustomer(
  userId: string,
  email: string
): Promise<string> {
  const billing = getUserBilling(userId);
  if (billing?.stripe_customer_id) return billing.stripe_customer_id;

  const name = email.split("@")[0] ?? email;
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { userId },
  });

  updateUserBilling(userId, { stripeCustomerId: customer.id, email });
  return customer.id;
}
