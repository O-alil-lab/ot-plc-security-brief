import { z } from "zod";
import { prisma } from "../db";
import { env } from "../env";
import { audit } from "../audit";
import { getEmailProvider } from "../email/provider";
import { emailSchema, unsubscribeTokenFor, unsubscribeUrl } from "../subscribers/service";
import { renderIssue, type IssueForRender } from "./render";

export class NewsletterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NewsletterError";
  }
}

export const MAX_ATTEMPTS = 3;

export const issueInclude = {
  stories: {
    orderBy: { position: "asc" as const },
    include: { story: { include: { sources: { include: { item: { include: { source: true } } } } } } },
  },
};

export async function loadIssue(id: string): Promise<IssueForRender> {
  return prisma.newsletterIssue.findUniqueOrThrow({ where: { id }, include: issueInclude });
}

export async function createIssue(actor: string) {
  const last = await prisma.newsletterIssue.aggregate({ _max: { number: true } });
  const number = (last._max.number ?? 0) + 1;
  const issue = await prisma.newsletterIssue.create({
    data: {
      number,
      title: `Weekly briefing #${number}`,
      subject: `OT & PLC Security Brief #${number}`,
      previewText: "This week's verified PLC, OT and ICS security developments.",
      intro: "",
      footer: "You're receiving this because you subscribed to the OT & PLC Security Brief.",
    },
  });
  await audit(actor, "issue.create", "issue", issue.id, { number });
  return issue;
}

export const issueUpdateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  subject: z.string().trim().min(3).max(200),
  previewText: z.string().trim().max(200).default(""),
  intro: z.string().trim().max(5000).default(""),
  footer: z.string().trim().max(2000).default(""),
  storyIds: z.array(z.string().min(1)).max(30),
});

export async function updateIssue(id: string, input: z.input<typeof issueUpdateSchema>, actor: string) {
  const data = issueUpdateSchema.parse(input);
  const issue = await prisma.newsletterIssue.findUniqueOrThrow({ where: { id } });
  if (issue.status !== "draft" && issue.status !== "reviewed") throw new NewsletterError("This issue has already been sent and can no longer be edited.");
  const stories = await prisma.story.findMany({ where: { id: { in: data.storyIds } }, select: { id: true, editorialStatus: true } });
  if (stories.some((s) => s.editorialStatus !== "published") || stories.length !== new Set(data.storyIds).size) {
    throw new NewsletterError("Only published stories can be included in an issue.");
  }
  await prisma.$transaction([
    prisma.issueStory.deleteMany({ where: { issueId: id } }),
    prisma.newsletterIssue.update({
      where: { id },
      data: {
        title: data.title,
        subject: data.subject,
        previewText: data.previewText,
        intro: data.intro,
        footer: data.footer,
        // Any edit after review requires a fresh review.
        status: "draft",
        reviewedAt: null,
        stories: { create: [...new Set(data.storyIds)].map((storyId, position) => ({ storyId, position })) },
      },
    }),
  ]);
  await audit(actor, "issue.update", "issue", id, { storyCount: data.storyIds.length });
}

export async function markReviewed(id: string, actor: string) {
  const issue = await prisma.newsletterIssue.findUniqueOrThrow({ where: { id }, include: { _count: { select: { stories: true } } } });
  if (issue.status !== "draft") throw new NewsletterError("Only draft issues can be marked reviewed.");
  if (issue._count.stories === 0) throw new NewsletterError("Add at least one published story first.");
  await prisma.newsletterIssue.update({ where: { id }, data: { status: "reviewed", reviewedAt: new Date() } });
  await audit(actor, "issue.reviewed", "issue", id);
}

function listUnsubscribeHeaders(subscriberId: string) {
  const oneClick = `${env.baseUrl}/api/unsubscribe?token=${unsubscribeTokenFor(subscriberId)}`;
  return {
    "List-Unsubscribe": `<${oneClick}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** Send ONE test email to an explicitly typed address. Never touches subscribers. */
export async function testSend(issueId: string, to: string, actor: string) {
  const address = emailSchema.parse(to);
  const issue = await loadIssue(issueId);
  const { html, text } = renderIssue(issue, { unsubscribeUrl: `${env.baseUrl}/unsubscribe`, isTest: true });
  const provider = getEmailProvider();
  const res = await provider.send({ to: address, subject: `[TEST] ${issue.subject}`, html, text });
  await audit(actor, "issue.test_send", "issue", issueId, { provider: provider.name, accepted: res.accepted });
  if (!res.accepted) throw new NewsletterError(`Test email was not accepted by the provider: ${res.error ?? "unknown error"}`);
  return { provider: provider.name, sendsRealEmail: provider.sendsRealEmail };
}

/**
 * Begin a bulk send. Requires a reviewed issue and the admin to type the
 * issue number. Creates one delivery row per active subscriber; a unique
 * (issue, subscriber) constraint plus the idempotency key make repeats safe.
 */
export async function startBulkSend(issueId: string, typedConfirmation: string, actor: string) {
  const issue = await prisma.newsletterIssue.findUniqueOrThrow({ where: { id: issueId }, include: { _count: { select: { stories: true } } } });
  if (issue.status === "sending" || issue.status === "sent" || issue.status === "partially_failed") {
    throw new NewsletterError("This issue has already been sent or is sending. It will not be sent twice.");
  }
  if (issue.status !== "reviewed") throw new NewsletterError("Mark the issue as reviewed before sending.");
  if (typedConfirmation.trim() !== String(issue.number)) {
    throw new NewsletterError(`Type the issue number (${issue.number}) to confirm the send.`);
  }
  if (issue._count.stories === 0) throw new NewsletterError("The issue has no stories.");

  // Atomic state change guards against double-clicks and concurrent requests.
  const claimed = await prisma.newsletterIssue.updateMany({
    where: { id: issueId, status: "reviewed", sendIdempotencyKey: null },
    data: { status: "sending", sendIdempotencyKey: `issue-${issueId}`, sendStartedAt: new Date() },
  });
  if (claimed.count !== 1) throw new NewsletterError("This issue is already being sent.");

  const subscribers = await prisma.subscriber.findMany({ where: { status: "active" }, select: { id: true } });
  await prisma.newsletterDelivery.createMany({
    data: subscribers.map((s) => ({ issueId, subscriberId: s.id })),
    skipDuplicates: true,
  });
  await audit(actor, "issue.bulk_send_started", "issue", issueId, { recipients: subscribers.length });
  return { recipients: subscribers.length };
}

/** Worker step: send pending deliveries for issues in "sending" state. */
export async function processSending(batchSize = 50): Promise<{ attempted: number }> {
  const issues = await prisma.newsletterIssue.findMany({ where: { status: "sending" }, select: { id: true } });
  let attempted = 0;
  const provider = getEmailProvider();
  for (const { id } of issues) {
    const issue = await loadIssue(id);
    const pending = await prisma.newsletterDelivery.findMany({
      where: { issueId: id, status: "pending" },
      include: { subscriber: true },
      take: batchSize,
    });
    for (const d of pending) {
      // Respect unsubscribes that happened after the send was queued.
      if (d.subscriber.status !== "active") {
        await prisma.newsletterDelivery.update({ where: { id: d.id }, data: { status: "failed", error: "Subscriber no longer active; skipped" } });
        continue;
      }
      const { html, text } = renderIssue(issue, { unsubscribeUrl: unsubscribeUrl(d.subscriberId) });
      attempted++;
      const res = await provider.send({ to: d.subscriber.email, subject: issue.subject, html, text, headers: listUnsubscribeHeaders(d.subscriberId) });
      const attempts = d.attempts + 1;
      await prisma.newsletterDelivery.update({
        where: { id: d.id },
        data: res.accepted
          ? { status: "accepted", attempts, providerMessageId: res.providerMessageId ?? null, error: null }
          : { status: attempts >= MAX_ATTEMPTS ? "failed" : "pending", attempts, error: res.error?.slice(0, 300) ?? "Unknown provider error" },
      });
    }
    const remaining = await prisma.newsletterDelivery.count({ where: { issueId: id, status: "pending" } });
    if (remaining === 0) {
      const failed = await prisma.newsletterDelivery.count({ where: { issueId: id, status: "failed", NOT: { error: "Subscriber no longer active; skipped" } } });
      await prisma.newsletterIssue.update({
        where: { id },
        data: { status: failed ? "partially_failed" : "sent", sendFinishedAt: new Date(), publishedAt: issue.publishedAt ?? new Date() },
      });
      await audit("worker", failed ? "issue.partially_failed" : "issue.sent", "issue", id, { failed });
    }
  }
  return { attempted };
}

/** Re-queue failed deliveries of a partially failed issue. */
export async function retryFailed(issueId: string, actor: string) {
  const issue = await prisma.newsletterIssue.findUniqueOrThrow({ where: { id: issueId } });
  if (issue.status !== "partially_failed") throw new NewsletterError("Only partially failed issues can be retried.");
  const res = await prisma.newsletterDelivery.updateMany({
    where: { issueId, status: "failed", NOT: { error: "Subscriber no longer active; skipped" } },
    data: { status: "pending", attempts: 0 },
  });
  await prisma.newsletterIssue.update({ where: { id: issueId }, data: { status: "sending" } });
  await audit(actor, "issue.retry_failed", "issue", issueId, { requeued: res.count });
  return { requeued: res.count };
}

export async function deliveryCounts(issueId: string) {
  const rows = await prisma.newsletterDelivery.groupBy({ by: ["status"], where: { issueId }, _count: true });
  const out = { pending: 0, accepted: 0, failed: 0 };
  for (const r of rows) out[r.status] = r._count;
  return out;
}
