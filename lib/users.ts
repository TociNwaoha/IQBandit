/**
 * lib/users.ts
 * Derives stable, opaque per-user identifiers from session email.
 * Never exposes raw email as a DB user_id.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import { createHash } from "crypto";
import type { SessionPayload } from "@/lib/auth";

/**
 * Returns a stable, opaque user_id derived from the session email.
 * Format: "u_" + first 24 hex chars of sha256(lowercase(email))
 * Example: "u_3d4f0a1b2c3e4f5a6b7c8d9e"
 *
 * Deterministic: same email always produces same user_id.
 * Opaque: raw email is never stored in the DB user_id field.
 */
export function getCurrentUserIdFromSession(session: SessionPayload): string {
  const normalized = session.email.toLowerCase().trim();
  const hash = createHash("sha256").update(normalized).digest("hex");
  return "u_" + hash.slice(0, 24);
}

/** Returns the raw email from the session (for display only, never for DB keys). */
export function getCurrentUserEmail(session: SessionPayload): string {
  return session.email;
}
