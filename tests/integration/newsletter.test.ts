import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { setEmailProviderForTests, type EmailProvider, type OutgoingEmail } from "@/lib/email/provider";
import { createIssue, updateIssue, markReviewed, testSend, startBulkSend, processSending, retryFailed, NewsletterError } from "@/lib/newsletter/send";
import { resetDb, makeSource } from "../helpers";

class FakeProvider implements EmailProvider {
  name = "fake";
  sendsRealEmail = true;
  sent: OutgoingEmail[] = [];
  failFor = new Set<string>();
  async send(m: OutgoingEmail) {
    if (this.failFor.has(m.to)) return { accepted: false, error: "mailbox unavailable" };
    this.sent.push(m);
    return { accepted: true, providerMessageId: `id-${this.sent.length}` };
  }
}
let fake: FakeProvider;

beforeEach(async () => {
  await resetDb();
  fake = new FakeProvider();
  setEmailProviderForTests(fake);
});
afterEach(() => setEmailProviderForTests(null));

async function setup(subscribers = ["a@example.com", "b@example.com"]) {
  const src = await makeSource();
  const item = await prisma.collectedItem.create({ data: { sourceId: src.id, guid: "g", title: "Item", contentHash: "h", url: "https://x.example/1" } });
  const story = await prisma.story.create({
    data: { headline: "Published <b>story</b>", slug: "s", summary: "Summary", editorialStatus: "published", publishedAt: new Date(), sources: { create: [{ itemId: item.id }] } },
  });
  for (const email of subscribers) {
    await prisma.subscriber.create({ data: { email, status: "active", consentAt: new Date(), consentTextVersion: "t", unsubscribeTokenHash: `h-${email}` } });
  }
  await prisma.subscriber.create({ data: { email: "pending@example.com", status: "pending", consentAt: new Date(), consentTextVersion: "t", unsubscribeTokenHash: "h-p" } });
  const issue = await createIssue("ed");
  await updateIssue(issue.id, { title: "Issue", subject: "Subject", storyIds: [story.id] }, "ed");
  return { issue: await prisma.newsletterIssue.findUniqueOrThrow({ where: { id: issue.id } }), story };
}

describe("newsletter safeguards", () => {
  it("only accepts published stories", async () => {
    const issue = await createIssue("ed");
    const draft = await prisma.story.create({ data: { headline: "Draft", slug: "d" } });
    await expect(updateIssue(issue.id, { title: "Issue", subject: "Subject", storyIds: [draft.id] }, "ed")).rejects.toThrow(NewsletterError);
  });

  it("test send goes only to the typed address and is marked as a test", async () => {
    const { issue } = await setup();
    await testSend(issue.id, "editor@example.com", "ed");
    expect(fake.sent.map((m) => m.to)).toEqual(["editor@example.com"]);
    expect(fake.sent[0].subject).toMatch(/^\[TEST\]/);
    expect(await prisma.newsletterDelivery.count()).toBe(0);
  });

  it("escapes story content in the HTML email and includes unsubscribe + List-Unsubscribe", async () => {
    const { issue } = await setup(["a@example.com"]);
    await markReviewed(issue.id, "ed");
    await startBulkSend(issue.id, String(issue.number), "ed");
    await processSending();
    const m = fake.sent[0];
    expect(m.html).toContain("Published &lt;b&gt;story&lt;/b&gt;");
    expect(m.html).toMatch(/unsubscribe\?token=/);
    expect(m.text).toMatch(/Unsubscribe: http/);
    expect(m.headers?.["List-Unsubscribe"]).toMatch(/^<http.*api\/unsubscribe\?token=/);
    expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("requires review and the typed issue number before a bulk send", async () => {
    const { issue } = await setup();
    await expect(startBulkSend(issue.id, String(issue.number), "ed")).rejects.toThrow(/reviewed/);
    await markReviewed(issue.id, "ed");
    await expect(startBulkSend(issue.id, "999", "ed")).rejects.toThrow(/Type the issue number/);
    expect(await prisma.newsletterDelivery.count()).toBe(0);
  });

  it("sends only to active subscribers, once, and never twice", async () => {
    const { issue } = await setup();
    await markReviewed(issue.id, "ed");
    const r = await startBulkSend(issue.id, String(issue.number), "ed");
    expect(r.recipients).toBe(2);
    await expect(startBulkSend(issue.id, String(issue.number), "ed")).rejects.toThrow(/already/);
    await processSending();
    await processSending();
    expect(fake.sent.map((m) => m.to).sort()).toEqual(["a@example.com", "b@example.com"]);
    expect(await prisma.newsletterDelivery.count()).toBe(2);
    const final = await prisma.newsletterIssue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(final.status).toBe("sent");
  });

  it("surfaces partial failures and can retry them", async () => {
    const { issue } = await setup();
    fake.failFor.add("b@example.com");
    await markReviewed(issue.id, "ed");
    await startBulkSend(issue.id, String(issue.number), "ed");
    for (let i = 0; i < 4; i++) await processSending();
    const failed = await prisma.newsletterIssue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(failed.status).toBe("partially_failed");
    const d = await prisma.newsletterDelivery.findFirstOrThrow({ where: { status: "failed" } });
    expect(d.attempts).toBe(3);
    expect(d.error).toMatch(/mailbox unavailable/);
    fake.failFor.clear();
    await retryFailed(issue.id, "ed");
    await processSending();
    expect((await prisma.newsletterIssue.findUniqueOrThrow({ where: { id: issue.id } })).status).toBe("sent");
    expect(fake.sent.filter((m) => m.to === "a@example.com")).toHaveLength(1);
  });

  it("skips subscribers who unsubscribe after the send was queued", async () => {
    const { issue } = await setup();
    await markReviewed(issue.id, "ed");
    await startBulkSend(issue.id, String(issue.number), "ed");
    await prisma.subscriber.update({ where: { email: "b@example.com" }, data: { status: "unsubscribed" } });
    await processSending();
    expect(fake.sent.map((m) => m.to)).toEqual(["a@example.com"]);
    expect((await prisma.newsletterIssue.findUniqueOrThrow({ where: { id: issue.id } })).status).toBe("sent");
  });

  it("editing a reviewed issue requires a new review", async () => {
    const { issue, story } = await setup();
    await markReviewed(issue.id, "ed");
    await updateIssue(issue.id, { title: "Changed", subject: "Subject", storyIds: [story.id] }, "ed");
    expect((await prisma.newsletterIssue.findUniqueOrThrow({ where: { id: issue.id } })).status).toBe("draft");
  });
});
