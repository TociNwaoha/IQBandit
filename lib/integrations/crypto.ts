/**
 * lib/integrations/crypto.ts
 * AES-256-GCM helpers for storing provider access/refresh tokens.
 *
 * Env var required:
 *   INTEGRATIONS_ENCRYPTION_SECRET — any string; key is derived via SHA-256.
 *   Generate one with: openssl rand -base64 32
 *
 * Ciphertext format: "<iv_b64>.<tag_b64>.<data_b64>"
 *   iv   — 12-byte random nonce (96-bit, GCM standard)
 *   tag  — 16-byte authentication tag
 *   data — AES-256-GCM encrypted bytes
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

import crypto from "crypto";

const ALG = "aes-256-gcm";
const IV_LEN = 12;   // 96-bit IV — GCM recommendation
const SEP = ".";

/** Known placeholder value from .env.local.example — treated as "not configured". */
const PLACEHOLDER = "replace_with_32+_random_bytes";

/**
 * Minimum character length for the secret.
 * 32 chars (≈24 bytes of base64) is a reasonable floor; openssl rand -base64 32
 * produces 44 chars which comfortably exceeds this.
 */
const MIN_SECRET_LEN = 32;

const KEY_ERR =
  "[integrations/crypto] INTEGRATIONS_ENCRYPTION_SECRET is not set.\n" +
  "  Generate one with: openssl rand -base64 32\n" +
  "  Then add to .env.local: INTEGRATIONS_ENCRYPTION_SECRET=<value>";

const WEAK_ERR =
  `[integrations/crypto] INTEGRATIONS_ENCRYPTION_SECRET is too weak or is a placeholder.\n` +
  `  Minimum length: ${MIN_SECRET_LEN} characters. Generate with: openssl rand -base64 32`;

/**
 * Throws if INTEGRATIONS_ENCRYPTION_SECRET is missing, a known placeholder, or
 * shorter than MIN_SECRET_LEN.  Call this before any operation that touches
 * credentials so the error appears close to the root cause.
 *
 * Export makes it usable in startup checks and server health endpoints.
 */
export function assertEncryptionConfigured(): void {
  const secret = process.env.INTEGRATIONS_ENCRYPTION_SECRET;
  if (!secret) throw new Error(KEY_ERR);
  if (secret === PLACEHOLDER || secret.length < MIN_SECRET_LEN) {
    throw new Error(WEAK_ERR);
  }
}

/**
 * Derives a 32-byte AES-256 key from the env var via SHA-256.
 * Deterministic — same env var always produces the same key.
 * Accepts any-length input string.
 */
function getKey(): Buffer {
  assertEncryptionConfigured(); // throws early with a clear diagnostic message
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const secret = process.env.INTEGRATIONS_ENCRYPTION_SECRET!;
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Encrypts `plaintext` with AES-256-GCM using a fresh random IV.
 * Returns a self-contained "<iv>.<tag>.<ciphertext>" string.
 * Returns "" for empty plaintext (symmetric with decryptSecret).
 * Throws if INTEGRATIONS_ENCRYPTION_SECRET is missing.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(SEP);
}

/**
 * Decrypts a value produced by encryptSecret().
 * Returns "" for empty input.
 * Throws on malformed ciphertext, wrong key, or failed authentication.
 */
export function decryptSecret(ciphertext: string): string {
  if (!ciphertext) return "";
  const key = getKey();
  const parts = ciphertext.split(SEP);
  if (parts.length !== 3) {
    throw new Error("[integrations/crypto] Malformed ciphertext — expected iv.tag.data");
  }
  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const enc = Buffer.from(parts[2], "base64");
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * Returns true if INTEGRATIONS_ENCRYPTION_SECRET is present, non-placeholder,
 * and meets the minimum length. Use this for health checks and UI warnings;
 * use assertEncryptionConfigured() when you need a hard error.
 */
export function isEncryptionConfigured(): boolean {
  const secret = process.env.INTEGRATIONS_ENCRYPTION_SECRET ?? "";
  return secret.length >= MIN_SECRET_LEN && secret !== PLACEHOLDER;
}
