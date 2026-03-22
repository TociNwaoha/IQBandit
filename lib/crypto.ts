/**
 * lib/crypto.ts
 * AES-256-CBC encryption/decryption for storing sensitive credentials.
 *
 * Env var required:
 *   ENCRYPTION_KEY — 32 bytes as 64 hex characters.
 *   Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Ciphertext format: "<iv_hex>:<data_hex>"
 *   iv   — 16-byte random IV (128-bit, CBC requirement)
 *   data — AES-256-CBC encrypted bytes
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

import crypto from "crypto";

const ALG = "aes-256-cbc";
const IV_LEN = 16; // 128-bit IV for CBC

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "[crypto] ENCRYPTION_KEY is not set.\n" +
        "  Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
        "  Then add to .env.local: ENCRYPTION_KEY=<value>"
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      `[crypto] ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${hex.length} chars.`
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts `text` with AES-256-CBC using a fresh random IV.
 * Returns "<iv_hex>:<ciphertext_hex>".
 * Returns "" for empty input.
 * Throws if ENCRYPTION_KEY is missing or invalid.
 */
export function encrypt(text: string): string {
  if (!text) return "";
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

/**
 * Decrypts a value produced by encrypt().
 * Returns "" for empty input.
 * Throws on malformed ciphertext or wrong key.
 */
export function decrypt(encrypted: string): string {
  if (!encrypted) return "";
  const key = getKey();
  const colonIdx = encrypted.indexOf(":");
  if (colonIdx === -1) {
    throw new Error("[crypto] Malformed ciphertext — expected iv:data format");
  }
  const ivHex = encrypted.slice(0, colonIdx);
  const dataHex = encrypted.slice(colonIdx + 1);
  if (!ivHex || !dataHex) {
    throw new Error("[crypto] Malformed ciphertext — empty iv or data");
  }
  const iv = Buffer.from(ivHex, "hex");
  const data = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
