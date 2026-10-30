import { createHmac } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db";
import { env } from "../env";
import { hashToken, newToken } from "../crypto";
import { getEmailProvider } from "../email/provider";
import { escapeHtml } from "../newsletter/render";

export const CONSENT_TEXT_VERSION = "2026-10-v1";
export const CONSENT_TEXT =
  "I agree to receive the OT & PLC Security Brief newsletter by email. I can unsubscribe at any time with one click.";

/** Identical public response whether or not the address already exists. */
export const SUBSCRIBE_RESPONSE =
  "Thanks. If this address can be subscribed, we've sent a confirmation link. Please check your inbox (and spam folder).";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email("Enter a valid email address");

/** Deterministic, unforgeable per-subscriber unsubscribe token (only its hash is stored). */
export function unsubscribeTokenFor(subscriberId: string): string {
  return createHmac("sha256", env.appSecret).update(`unsubscribe:${subscriberId}`).digest("base64url");
}

export function unsubscribeUrl(subscriberId: string): string {
  return `${env.baseUrl}/unsubscribe?token=${unsubscribeTokenFor(subscriberId)}`;
}

async function sendConfirmation(email: string, token: string) {
  const link = `${env.baseUrl}/subscribe/confirm?token=${token}`;
  const provider = getEmailProvider();
  const res = await provider.send({
    to: email,
    subject: "Confirm your OT & PLC Security Brief subscription",
    text: `Please confirm your subscription to the OT & PLC Security Brief:\n\n${link}\n\nThis link expires in 48 hours. If you didn't request this, ignore this email and you won't be subscribed.`,
    html: `<p>Please confirm your subscription to the <strong>OT &amp; PLC Security Brief</strong>.</p><p><a href="${escapeHtml(link)}">Confirm subscription</a></p><p style="color:#555">This link expires in 48 hours. If you didn't request this, ignore this email and you won't be subscribed.</p>`,
  });
  if (!res.accepted) console.warn("[subscribe] confirmation email not accepted by provider:", res.error);
}

export type SubscribeInput = { email: string; consent: boolean; signupSource?: string };

/**
 * Start (double opt-in) subscription. Always resolves to the same public
 * message so callers cannot learn whether an address is already subscribed.
 */
export async function subscribe(input: SubscribeInput): Promise<{ message: string }> {
  if (!input.consent) throw new z.ZodError([{ code: "custom", path: ["consent"], message: "Please tick the consent box to subscribe.", input: input.consent }]);
  const email = emailSchema.parse(input.email);
  const existing = await prisma.subscriber.findUnique({ where: { email } });

  if (existing?.status === "active") return { message: SUBSCRIBE_RESPONSE };

  const token = newToken();
  const expires = new Date(Date.now() + 48 * 3600_000);
  if (existing) {
    await prisma.subscriber.update({
      where: { id: existing.id },
      data: {
        status: "pending",
        consentAt: new Date(),
        consentTextVersion: CONSENT_TEXT_VERSION,
        confirmTokenHash: hashToken(token),
        confirmTokenExpires: expires,
        unsubscribedAt: null,
      },
    });
  } else {
    const created = await prisma.subscriber.create({
      data: {
        email,
        status: "pending",
        signupSource: (input.signupSource ?? "website").slice(0, 50),
        consentAt: new Date(),
        consentTextVersion: CONSENT_TEXT_VERSION,
        confirmTokenHash: hashToken(token),
        confirmTokenExpires: expires,
        unsubscribeTokenHash: `pending-${newToken()}`,
      },
    });
    await prisma.subscriber.update({
      where: { id: created.id },
      data: { unsubscribeTokenHash: hashToken(unsubscribeTokenFor(created.id)) },
    });
  }
  await sendConfirmation(email, token);
  return { message: SUBSCRIBE_RESPONSE };
}

export async function confirmSubscription(token: string): Promise<"confirmed" | "invalid"> {
  if (!token || token.length > 200) return "invalid";
  const sub = await prisma.subscriber.findUnique({ where: { confirmTokenHash: hashToken(token) } });
  if (!sub || !sub.confirmTokenExpires || sub.confirmTokenExpires < new Date()) return "invalid";
  await prisma.subscriber.update({
    where: { id: sub.id },
    data: { status: "active", confirmedAt: new Date(), confirmTokenHash: null, confirmTokenExpires: null },
  });
  return "confirmed";
}

/** Idempotent: unsubscribing twice is fine and returns the same result. */
export async function unsubscribe(token: string): Promise<"unsubscribed" | "invalid"> {
  if (!token || token.length > 200) return "invalid";
  const sub = await prisma.subscriber.findUnique({ where: { unsubscribeTokenHash: hashToken(token) } });
  if (!sub) return "invalid";
  if (sub.status !== "unsubscribed") {
    await prisma.subscriber.update({
      where: { id: sub.id },
      data: { status: "unsubscribed", unsubscribedAt: new Date(), confirmTokenHash: null, confirmTokenExpires: null },
    });
  }
  return "unsubscribed";
}
