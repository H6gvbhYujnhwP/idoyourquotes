/**
 * Encryption for stored Xero tokens.
 *
 * Delivery 2.11. A Xero refresh token is a long-lived key to an
 * organisation's accounts — with it you can read and write invoices,
 * contacts and settings until someone revokes the connection. Storing
 * one as plain text in a database row is the kind of thing that is fine
 * right up until the day it isn't, and the app owner has signed up to
 * Xero's minimum security requirements, so tokens are encrypted at rest.
 *
 * AES-256-GCM. Authenticated, so a tampered ciphertext fails to decrypt
 * rather than silently returning rubbish. Fresh random IV per encryption
 * — never reuse an IV with GCM, it breaks the mode outright.
 *
 * KEY DERIVATION: scrypt over JWT_SECRET with a fixed application salt.
 * This deliberately avoids introducing a fourth secret to manage, at one
 * cost worth knowing: ROTATING JWT_SECRET MAKES EVERY STORED XERO TOKEN
 * UNREADABLE and every organisation has to reconnect. Decryption failure
 * is handled as "not connected" rather than as a crash, so the worst
 * case is a Connect button reappearing in Settings.
 *
 * Stored format: <iv-hex>:<authTag-hex>:<ciphertext-hex>. Prefixed with
 * a version marker so a future change of scheme can be told apart from
 * the current one without guessing.
 */
import crypto from "crypto";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit, the GCM standard
const KEY_SALT = "idyq.xero.tokens.v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      "JWT_SECRET is not configured — cannot encrypt or decrypt Xero tokens",
    );
  }
  cachedKey = crypto.scryptSync(secret, KEY_SALT, 32);
  return cachedKey;
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/**
 * Returns null rather than throwing when the stored value can't be
 * read — wrong key after a JWT_SECRET rotation, a truncated row, a
 * value written by a future scheme. Callers treat null as "this
 * connection is no longer usable, ask the user to reconnect", which is
 * the only sensible recovery and is far better than a 500 on the
 * Settings page.
 */
export function decryptToken(stored: string): string | null {
  try {
    const parts = (stored ?? "").split(":");
    if (parts.length !== 4 || parts[0] !== VERSION) return null;
    const [, ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv(
      ALGO,
      getKey(),
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataHex, "hex")),
      decipher.final(),
    ]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Sign a short-lived OAuth `state` value.
 *
 * The state parameter is the CSRF defence on the authorisation round
 * trip: without it, anyone could hand a user a crafted callback URL and
 * attach THEIR Xero organisation to the user's IDYQ account. So state
 * carries the org and user it was issued for, an expiry, and an HMAC —
 * and the callback refuses anything that doesn't verify.
 */
export function signState(payload: {
  orgId: number;
  userId: number;
}): string {
  const secret = process.env.JWT_SECRET ?? "";
  const body = JSON.stringify({
    ...payload,
    nonce: crypto.randomBytes(8).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
  });
  const b64 = Buffer.from(body, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

export function verifyState(
  state: string,
): { orgId: number; userId: number } | null {
  try {
    const secret = process.env.JWT_SECRET ?? "";
    const [b64, sig] = (state ?? "").split(".");
    if (!b64 || !sig) return null;
    const expected = crypto
      .createHmac("sha256", secret)
      .update(b64)
      .digest("hex");
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (
      typeof parsed?.exp !== "number" ||
      parsed.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    if (typeof parsed?.orgId !== "number" || typeof parsed?.userId !== "number") {
      return null;
    }
    return { orgId: parsed.orgId, userId: parsed.userId };
  } catch {
    return null;
  }
}
