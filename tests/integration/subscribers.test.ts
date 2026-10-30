import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { subscribe, confirmSubscription, unsubscribe, unsubscribeTokenFor, SUBSCRIBE_RESPONSE } from "@/lib/subscribers/service";
import { rateLimit, resetRateLimits } from "@/lib/rateLimit";
import { resetDb } from "../helpers";

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
});

const tokenFromOutbox = async () => {
  const msg = await prisma.devOutboxMessage.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
  return /token=([A-Za-z0-9_-]+)/.exec(msg.text)![1];
};

describe("subscriptions", () => {
  it("requires explicit consent", async () => {
    await expect(subscribe({ email: "a@example.com", consent: false })).rejects.toThrow(/consent/i);
    expect(await prisma.subscriber.count()).toBe(0);
  });

  it("validates the email address", async () => {
    await expect(subscribe({ email: "not-an-email", consent: true })).rejects.toThrow();
  });

  it("double opt-in: pending until confirmed, tokens stored hashed", async () => {
    const res = await subscribe({ email: "Engineer@Example.com ", consent: true });
    expect(res.message).toBe(SUBSCRIBE_RESPONSE);
    const sub = await prisma.subscriber.findUniqueOrThrow({ where: { email: "engineer@example.com" } });
    expect(sub.status).toBe("pending");
    const token = await tokenFromOutbox();
    expect(sub.confirmTokenHash).not.toBe(token);
    expect(await confirmSubscription(token)).toBe("confirmed");
    expect((await prisma.subscriber.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("active");
    expect(await confirmSubscription(token)).toBe("invalid"); // single use
  });

  it("gives the same response for existing addresses (no enumeration)", async () => {
    const first = await subscribe({ email: "x@example.com", consent: true });
    await confirmSubscription(await tokenFromOutbox());
    const again = await subscribe({ email: "x@example.com", consent: true });
    expect(again).toEqual(first);
    expect(await prisma.subscriber.count()).toBe(1);
  });

  it("unsubscribes with the per-subscriber token, idempotently", async () => {
    await subscribe({ email: "u@example.com", consent: true });
    await confirmSubscription(await tokenFromOutbox());
    const sub = await prisma.subscriber.findUniqueOrThrow({ where: { email: "u@example.com" } });
    const t = unsubscribeTokenFor(sub.id);
    expect(await unsubscribe(t)).toBe("unsubscribed");
    expect(await unsubscribe(t)).toBe("unsubscribed");
    expect(await unsubscribe("forged-token")).toBe("invalid");
    const after = await prisma.subscriber.findUniqueOrThrow({ where: { id: sub.id } });
    expect(after.status).toBe("unsubscribed");
    expect(after.unsubscribedAt).toBeInstanceOf(Date);
  });

  it("rate-limits by key", () => {
    for (let i = 0; i < 5; i++) expect(rateLimit("subscribe:1.2.3.4", 5, 60_000)).toBe(true);
    expect(rateLimit("subscribe:1.2.3.4", 5, 60_000)).toBe(false);
    expect(rateLimit("subscribe:5.6.7.8", 5, 60_000)).toBe(true);
  });
});
