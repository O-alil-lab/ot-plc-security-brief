"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import type { EditorialStatus, TrustLevel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { createSession, destroySession, requireAdminAction, UnauthorizedError } from "@/lib/auth/session";
import { verifyPassword, dummyVerify } from "@/lib/auth/password";
import { rateLimit } from "@/lib/rateLimit";
import { headers } from "next/headers";
import { clientIp } from "@/lib/rateLimit";
import { createStoryFromItems, updateStory, transitionStory, linkItem, unlinkItem, WorkflowError } from "@/lib/stories/workflow";
import { runSource, MIN_POLL_MINUTES } from "@/lib/ingest/ingest";
import { resolveAndValidate, SsrfError } from "@/lib/ingest/ssrf";
import { createIssue, updateIssue, markReviewed, testSend, startBulkSend, retryFailed, NewsletterError } from "@/lib/newsletter/send";
import { promoteSubmission, setSubmissionStatus } from "@/lib/submissions";
import { importSocialPosts } from "@/lib/social/import";
import { getAIProvider } from "@/lib/ai/provider";
import { syncKev } from "@/lib/kev";
import { FetchError } from "@/lib/ingest/fetcher";

/** Errors we can show to the editor verbatim. Everything else gets a generic message. */
function userMessage(e: unknown): string {
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join("; ");
  if (e instanceof WorkflowError || e instanceof NewsletterError || e instanceof SsrfError || e instanceof FetchError) return e.message;
  if (e instanceof UnauthorizedError) return "Your session has expired. Sign in again.";
  console.error("[admin action]", (e as Error)?.message?.slice(0, 300));
  return "Something went wrong. Check the server log for details.";
}

function back(path: string, kind: "msg" | "error", text: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(text.slice(0, 300))}`);
}

/**
 * Wrap an admin mutation: authenticate + CSRF-check, run, then redirect
 * with a success or error message. Unauthenticated calls never run `fn`.
 */
async function guarded(formData: FormData, path: string, fn: (actor: string) => Promise<string | { redirectTo: string; msg: string }>): Promise<never> {
  let session;
  try {
    session = await requireAdminAction(formData);
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/admin/login");
    throw e;
  }
  let result: string | { redirectTo: string; msg: string };
  try {
    result = await fn(session.email);
  } catch (e) {
    back(path, "error", userMessage(e));
  }
  revalidatePath("/admin", "layout");
  if (typeof result === "string") back(path, "msg", result);
  back(result.redirectTo, "msg", result.msg);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

// ---------------------------------------------------------------- auth

export async function loginAction(formData: FormData) {
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, 8, 15 * 60_000)) redirect("/admin/login?error=" + encodeURIComponent("Too many sign-in attempts. Wait 15 minutes."));
  const email = str(formData, "email").trim().toLowerCase();
  const password = str(formData, "password");
  const admin = email ? await prisma.admin.findUnique({ where: { email } }) : null;
  let ok = false;
  if (admin) ok = await verifyPassword(admin.passwordHash, password);
  else await dummyVerify(password);
  if (!admin || !ok) {
    await audit("anonymous", "auth.login_failed", "admin", null, {});
    redirect("/admin/login?error=" + encodeURIComponent("Email or password is incorrect."));
  }
  await createSession(admin.id);
  await audit(admin.email, "auth.login", "admin", admin.id);
  redirect("/admin");
}

export async function logoutAction(formData: FormData) {
  try {
    const s = await requireAdminAction(formData);
    await audit(s.email, "auth.logout", "admin", s.adminId);
  } catch {
    /* fall through: always clear the cookie */
  }
  await destroySession();
  redirect("/admin/login");
}

// ---------------------------------------------------------------- inbox

// One action per target status. (A shared action that read the status from the
// clicked button's name/value broke: React replaces the `name` of a button that
// has its own formAction, so the value could be lost.)
async function setItemStatus(formData: FormData, status: "new" | "investigating" | "rejected") {
  const ids = formData.getAll("itemId").map(String).filter(Boolean);
  const returnTo = str(formData, "returnTo") || "/admin/inbox";
  return guarded(formData, returnTo.startsWith("/admin") ? returnTo : "/admin/inbox", async (actor) => {
    if (!ids.length) throw new WorkflowError("Select at least one item.");
    await prisma.collectedItem.updateMany({ where: { id: { in: ids } }, data: { inboxStatus: status } });
    await audit(actor, `item.${status}`, "item", ids.length === 1 ? ids[0] : null, { count: ids.length });
    return `${ids.length} item${ids.length > 1 ? "s" : ""} marked ${status === "new" ? "as new" : status}.`;
  });
}

export async function investigateItemsAction(formData: FormData) {
  return setItemStatus(formData, "investigating");
}

export async function rejectItemsAction(formData: FormData) {
  return setItemStatus(formData, "rejected");
}

export async function restoreItemsAction(formData: FormData) {
  return setItemStatus(formData, "new");
}

export async function createStoryAction(formData: FormData) {
  const ids = formData.getAll("itemId").map(String).filter(Boolean);
  return guarded(formData, "/admin/inbox", async (actor) => {
    const story = await createStoryFromItems(ids, actor);
    return { redirectTo: `/admin/stories/${story.id}`, msg: "Draft story created. Write the summary from the linked sources." };
  });
}

export async function groupItemsAction(formData: FormData) {
  const ids = formData.getAll("itemId").map(String).filter(Boolean);
  return guarded(formData, "/admin/inbox", async (actor) => {
    if (ids.length < 2) throw new WorkflowError("Select two or more items to group as duplicates.");
    const items = await prisma.collectedItem.findMany({ where: { id: { in: ids } } });
    const groupId = items.find((i) => i.duplicateGroupId)?.duplicateGroupId ?? (await prisma.duplicateGroup.create({ data: { reason: "Grouped by editor" } })).id;
    await prisma.collectedItem.updateMany({ where: { id: { in: ids } }, data: { duplicateGroupId: groupId } });
    await audit(actor, "item.group", "duplicateGroup", groupId, { ids });
    return `${ids.length} items grouped as duplicates.`;
  });
}

export async function splitItemAction(formData: FormData) {
  const id = str(formData, "itemId");
  return guarded(formData, `/admin/inbox/${id}`, async (actor) => {
    const item = await prisma.collectedItem.findUniqueOrThrow({ where: { id } });
    if (!item.duplicateGroupId) throw new WorkflowError("This item is not in a duplicate group.");
    await prisma.collectedItem.update({ where: { id }, data: { duplicateGroupId: null } });
    const left = await prisma.collectedItem.count({ where: { duplicateGroupId: item.duplicateGroupId } });
    if (left <= 1) {
      await prisma.collectedItem.updateMany({ where: { duplicateGroupId: item.duplicateGroupId }, data: { duplicateGroupId: null } });
      await prisma.duplicateGroup.delete({ where: { id: item.duplicateGroupId } }).catch(() => {});
    }
    await audit(actor, "item.split", "item", id, { group: item.duplicateGroupId });
    return "Item removed from the duplicate group.";
  });
}

// ---------------------------------------------------------------- stories

export async function saveStoryAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, `/admin/stories/${id}`, async (actor) => {
    await updateStory(
      id,
      {
        headline: str(formData, "headline"),
        summary: str(formData, "summary"),
        whyItMatters: str(formData, "whyItMatters"),
        defensiveGuidance: str(formData, "defensiveGuidance"),
        guidanceSource: str(formData, "guidanceSource"),
        categories: str(formData, "categories"),
        vendors: str(formData, "vendors"),
        products: str(formData, "products"),
        affectedVersions: str(formData, "affectedVersions"),
        cveIds: str(formData, "cveIds"),
        advisoryIds: str(formData, "advisoryIds"),
        verificationStatus: str(formData, "verificationStatus") as "unverified",
      },
      actor,
    );
    if (formData.get("aiAssisted") === "on") await prisma.story.update({ where: { id }, data: { aiAssisted: true } });
    return "Story saved.";
  });
}

export async function transitionStoryAction(formData: FormData) {
  const id = str(formData, "id");
  const to = str(formData, "to") as EditorialStatus;
  return guarded(formData, `/admin/stories/${id}`, async (actor) => {
    if (to === "published" && formData.get("confirmPublish") !== "yes") throw new WorkflowError("Tick the confirmation box to publish.");
    await transitionStory(id, to, actor);
    return to === "published" ? "Published. The story is now live on the public site." : `Story moved to ${to}.`;
  });
}

export async function linkItemAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, `/admin/stories/${id}`, async (actor) => {
    const itemId = str(formData, "itemId").trim();
    const exists = await prisma.collectedItem.findUnique({ where: { id: itemId } });
    if (!exists) throw new WorkflowError("No collected item with that ID.");
    await linkItem(id, itemId, actor);
    return "Source linked.";
  });
}

export async function unlinkItemAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, `/admin/stories/${id}`, async (actor) => {
    await unlinkItem(id, str(formData, "itemId"), actor);
    return "Source removed.";
  });
}

export async function aiSuggestAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, `/admin/stories/${id}`, async (actor) => {
    const ai = getAIProvider();
    if (!ai.enabled) throw new WorkflowError("AI suggestions are off. Set AI_PROVIDER, ANTHROPIC_API_KEY and AI_MODEL to enable them.");
    const story = await prisma.story.findUniqueOrThrow({ where: { id }, include: { sources: { include: { item: { include: { source: true } } } } } });
    const suggestion = await ai.suggestStory(
      story.sources.map(({ item }) => ({ title: item.title, url: item.url, sourceName: item.source.name, publishedAt: item.publishedAt, excerpt: item.excerpt })),
    );
    // Stored separately as a suggestion; never written into the story fields.
    await prisma.appSetting.upsert({
      where: { key: `ai.suggestion.${id}` },
      create: { key: `ai.suggestion.${id}`, value: { ...suggestion, at: new Date().toISOString() } },
      update: { value: { ...suggestion, at: new Date().toISOString() } },
    });
    await audit(actor, "story.ai_suggest", "story", id, { provider: ai.name });
    return "AI suggestion ready below. Check every fact against the sources before using any of it.";
  });
}

// ---------------------------------------------------------------- sources

const sourceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().trim().url().max(2000),
  type: z.enum(["rss", "atom"]),
  trustLevel: z.enum(["primary_vendor", "government_cert", "research", "news", "social", "community"]),
  category: z.string().trim().min(1).max(60),
  pollIntervalMinutes: z.coerce.number().int().min(MIN_POLL_MINUTES, `Poll interval must be at least ${MIN_POLL_MINUTES} minutes`).max(10_080),
  enabled: z.boolean(),
});

export async function saveSourceAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, id ? `/admin/sources/${id}` : "/admin/sources", async (actor) => {
    const data = sourceSchema.parse({
      name: str(formData, "name"),
      url: str(formData, "url"),
      type: str(formData, "type"),
      trustLevel: str(formData, "trustLevel") as TrustLevel,
      category: str(formData, "category"),
      pollIntervalMinutes: str(formData, "pollIntervalMinutes"),
      enabled: formData.get("enabled") === "on",
    });
    // SSRF validation on save (and again on every fetch).
    await resolveAndValidate(data.url);
    if (id) {
      await prisma.source.update({ where: { id }, data: { ...data, etag: null, lastModified: null } });
      await audit(actor, "source.update", "source", id, { name: data.name });
      return "Source saved.";
    }
    const created = await prisma.source.create({ data });
    await audit(actor, "source.create", "source", created.id, { name: data.name });
    return { redirectTo: `/admin/sources/${created.id}`, msg: "Source added. Use “Fetch now” to test it." };
  });
}

export async function toggleSourceAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, str(formData, "returnTo") || "/admin/sources", async (actor) => {
    const s = await prisma.source.findUniqueOrThrow({ where: { id } });
    await prisma.source.update({ where: { id }, data: { enabled: !s.enabled } });
    await audit(actor, s.enabled ? "source.disable" : "source.enable", "source", id);
    return `${s.name} ${s.enabled ? "disabled" : "enabled"}.`;
  });
}

export async function runSourceAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, str(formData, "returnTo") || `/admin/sources/${id}`, async (actor) => {
    const r = await runSource(id, { trigger: "manual" });
    await audit(actor, "source.run", "source", id, { status: r.status });
    if (r.status !== "ok") throw new WorkflowError(`Fetch failed (${r.status}${r.httpStatus ? `, HTTP ${r.httpStatus}` : ""}): ${r.error}`);
    return r.httpStatus === 304 ? "Fetched: not modified since last fetch." : `Fetched ${r.itemsSeen} items: ${r.itemsNew} new, ${r.itemsUpdated} updated.`;
  });
}

export async function syncKevAction(formData: FormData) {
  return guarded(formData, "/admin/sources", async (actor) => {
    const r = await syncKev();
    await audit(actor, "kev.sync", "kev", null, { count: r.count });
    return `CISA KEV synced: ${r.count} entries.`;
  });
}

// ---------------------------------------------------------------- newsletter

export async function createIssueAction(formData: FormData) {
  return guarded(formData, "/admin/newsletter", async (actor) => {
    const issue = await createIssue(actor);
    return { redirectTo: `/admin/newsletter/${issue.id}`, msg: `Issue #${issue.number} created.` };
  });
}

export async function saveIssueAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, `/admin/newsletter/${id}`, async (actor) => {
    // Order: the "order" field holds comma-separated story IDs in display order.
    const storyIds = str(formData, "order").split(",").map((s) => s.trim()).filter(Boolean);
    await updateIssue(
      id,
      { title: str(formData, "title"), subject: str(formData, "subject"), previewText: str(formData, "previewText"), intro: str(formData, "intro"), footer: str(formData, "footer"), storyIds },
      actor,
    );
    return "Issue saved. Review it again before sending.";
  });
}

export async function reviewIssueAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, `/admin/newsletter/${id}`, async (actor) => {
    await markReviewed(id, actor);
    return "Marked as reviewed.";
  });
}

export async function testSendAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, `/admin/newsletter/${id}`, async (actor) => {
    const r = await testSend(id, str(formData, "to"), actor);
    return r.sendsRealEmail ? `Test email accepted by ${r.provider} for delivery.` : "Test email stored in the Dev mailbox (nothing was sent).";
  });
}

export async function bulkSendAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, `/admin/newsletter/${id}`, async (actor) => {
    const r = await startBulkSend(id, str(formData, "confirmNumber"), actor);
    return `Queued for ${r.recipients} active subscriber${r.recipients === 1 ? "" : "s"}. The worker sends in batches; this page shows progress.`;
  });
}

export async function retryFailedAction(formData: FormData) {
  const id = str(formData, "id");
  return guarded(formData, `/admin/newsletter/${id}`, async (actor) => {
    const r = await retryFailed(id, actor);
    return `${r.requeued} failed deliveries queued again.`;
  });
}

// ---------------------------------------------------------------- submissions & import

export async function submissionAction(formData: FormData) {
  const id = str(formData, "id");
  const op = str(formData, "op");
  return guarded(formData, "/admin/submissions", async (actor) => {
    if (op === "promote") {
      await promoteSubmission(id, actor);
      return "Submission added to the inbox as an unverified item.";
    }
    if (op === "reject" || op === "spam") {
      await setSubmissionStatus(id, op === "reject" ? "rejected" : "spam", actor);
      return op === "reject" ? "Submission rejected." : "Marked as spam.";
    }
    throw new WorkflowError("Unknown action");
  });
}

export async function socialImportAction(formData: FormData) {
  return guarded(formData, "/admin/import", async (actor) => {
    let payload: unknown;
    const file = formData.get("file");
    const manualUrl = str(formData, "postUrl").trim();
    if (file instanceof File && file.size > 0) {
      if (file.size > 2 * 1024 * 1024) throw new WorkflowError("File is larger than 2 MB.");
      try {
        payload = JSON.parse(await file.text());
      } catch {
        throw new WorkflowError("The file is not valid JSON.");
      }
    } else if (manualUrl) {
      const publishedAt = str(formData, "publishedAt");
      payload = {
        version: 1,
        posts: [
          {
            platform: str(formData, "platform") || "unknown",
            author: str(formData, "author") || undefined,
            url: manualUrl,
            publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
            text: str(formData, "text") || undefined,
            linkedPrimarySource: str(formData, "linkedPrimarySource") || undefined,
          },
        ],
      };
    } else {
      throw new WorkflowError("Choose a JSON file or fill in a post URL.");
    }
    const r = await importSocialPosts(payload, actor);
    return `Imported ${r.imported} post${r.imported === 1 ? "" : "s"} (${r.itemsNew} new) into the inbox as unverified.`;
  });
}
