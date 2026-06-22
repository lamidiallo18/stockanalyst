// AES-256-GCM encryption for API keys at rest.
//
// The master key is derived (scrypt) from APP_SECRET in .env.local. Keys are
// therefore never stored in plaintext in the SQLite DB. If APP_SECRET is
// rotated, previously stored ciphertext can no longer be decrypted (by design).
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const SALT = "stockanalyst.key.v1"; // static app-level salt; secret is APP_SECRET

function getMasterKey(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "APP_SECRET is missing or too short. Set a strong APP_SECRET (>=16 chars) in .env.local before storing API keys.",
    );
  }
  return crypto.scryptSync(secret, SALT, 32);
}

/** Returns base64 of iv(12) | authTag(16) | ciphertext. */
export function encryptSecret(plaintext: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const key = getMasterKey();
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}

/** True if APP_SECRET is configured well enough to encrypt secrets. */
export function canEncrypt(): boolean {
  return Boolean(process.env.APP_SECRET && process.env.APP_SECRET.length >= 16);
}

/** Masks a secret for display: shows last 4 chars only. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "••••";
  return "••••••••" + plaintext.slice(-4);
}
