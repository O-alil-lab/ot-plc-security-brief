import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** URL-safe random token (256 bits). The raw value is only ever sent to the user. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Keyed hash for storing tokens and IPs. Never store raw tokens. */
export function hashToken(token: string): string {
  return createHmac("sha256", env.appSecret).update(token).digest("hex");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Mask an email for logs: j***@example.com */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  return `${user.slice(0, 1)}***@${domain}`;
}
