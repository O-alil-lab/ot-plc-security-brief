import { z } from "zod";
import { prisma } from "./db";
import { audit } from "./audit";
import { hashToken } from "./crypto";
import { safeHttpUrl, toPlainText } from "./sanitize";
import { getOrCreateSystemSource } from "./social/import";
import { upsertItems } from "./ingest/ingest";

export const submissionSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => !!safeHttpUrl(v), "Enter a full http(s) link"),
  note: z.string().trim().max(1000).optional().transform((v) => (v ? v : undefined)),
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined))
    .pipe(z.string().email("Enter a valid email or leave it blank").optional()),
  // Honeypot: real users never fill this hidden field.
  website: z.string().max(0, "Spam detected").optional().default(""),
});

const SPAM_PATTERNS = /(casino|viagra|crypto giveaway|loan offer|seo services|backlinks)/i;

export async function createSubmission(input: z.input<typeof submissionSchema>, ip: string) {
  const data = submissionSchema.parse(input);
  const looksSpam = SPAM_PATTERNS.test(`${data.url} ${data.note ?? ""}`);
  return prisma.submission.create({
    data: {
      url: safeHttpUrl(data.url)!,
      note: data.note ? toPlainText(data.note, 1000) : null,
      contactEmail: data.contactEmail ?? null,
      ipHash: hashToken(`ip:${ip}`),
      status: looksSpam ? "spam" : "pending",
    },
  });
}

/** Moves a reviewed submission into the editorial inbox as an unverified item. */
export async function promoteSubmission(id: string, actor: string) {
  const sub = await prisma.submission.findUniqueOrThrow({ where: { id } });
  if (sub.status === "promoted") return sub;
  const source = await getOrCreateSystemSource("submission");
  await upsertItems(source, [
    {
      guid: `submission:${sub.id}`,
      url: sub.url,
      title: `Community submission: ${sub.url.slice(0, 200)}`,
      excerpt: sub.note ?? "",
      author: null,
      publishedAt: sub.createdAt,
      sourceUpdatedAt: null,
    },
  ]);
  const item = await prisma.collectedItem.findUniqueOrThrow({ where: { sourceId_guid: { sourceId: source.id, guid: `submission:${sub.id}` } } });
  const updated = await prisma.submission.update({ where: { id }, data: { status: "promoted", itemId: item.id } });
  await audit(actor, "submission.promote", "submission", id, { itemId: item.id });
  return updated;
}

export async function setSubmissionStatus(id: string, status: "rejected" | "spam" | "pending", actor: string) {
  await prisma.submission.update({ where: { id }, data: { status } });
  await audit(actor, `submission.${status}`, "submission", id);
}
