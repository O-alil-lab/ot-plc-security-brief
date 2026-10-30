import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { upsertItems } from "@/lib/ingest/ingest";
import { createStoryFromItems, transitionStory, updateStory, unlinkItem, WorkflowError } from "@/lib/stories/workflow";
import { resetDb, makeSource } from "../helpers";

beforeEach(resetDb);

async function itemFrom(trustLevel: "news" | "primary_vendor" | "social", title = "Siemens PLC advisory CVE-2026-0001") {
  const s = await makeSource({ trustLevel });
  await upsertItems(s, [{ guid: title + trustLevel, url: `https://x.example/${trustLevel}`, title, excerpt: "", author: null, publishedAt: new Date(), sourceUpdatedAt: null }]);
  return prisma.collectedItem.findFirstOrThrow({ where: { sourceId: s.id } });
}

const fill = { headline: "Siemens PLC advisory", summary: "Written by an editor.", verificationStatus: "unverified" as const };

describe("story workflow", () => {
  it("creates an unverified draft from inbox items and marks them used", async () => {
    const item = await itemFrom("primary_vendor");
    const story = await createStoryFromItems([item.id], "ed");
    expect(story).toMatchObject({ editorialStatus: "draft", verificationStatus: "unverified", summary: "" });
    expect(story.cveIds).toEqual(["CVE-2026-0001"]);
    expect((await prisma.collectedItem.findUniqueOrThrow({ where: { id: item.id } })).inboxStatus).toBe("used");
  });

  it("cannot publish directly from draft", async () => {
    const story = await createStoryFromItems([(await itemFrom("news")).id], "ed");
    await updateStory(story.id, fill, "ed");
    await expect(transitionStory(story.id, "published", "ed")).rejects.toThrow(WorkflowError);
    expect((await prisma.story.findUniqueOrThrow({ where: { id: story.id } })).publishedAt).toBeNull();
  });

  it("requires a summary before approval", async () => {
    const story = await createStoryFromItems([(await itemFrom("news")).id], "ed");
    await expect(transitionStory(story.id, "approved", "ed")).rejects.toThrow(/summary/);
  });

  it("requires at least one source before approval", async () => {
    const story = await prisma.story.create({ data: { headline: "No sources", slug: "no-sources", summary: "x" } });
    await expect(transitionStory(story.id, "approved", "ed")).rejects.toThrow(/source/);
  });

  it("goes draft → approved → published with an audit trail", async () => {
    const story = await createStoryFromItems([(await itemFrom("news")).id], "ed");
    await updateStory(story.id, fill, "ed");
    await transitionStory(story.id, "approved", "ed");
    const pub = await transitionStory(story.id, "published", "ed");
    expect(pub.editorialStatus).toBe("published");
    expect(pub.publishedAt).toBeInstanceOf(Date);
    const actions = (await prisma.auditEvent.findMany({ where: { objectId: story.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["story.create", "story.update", "story.approved", "story.published"]);
  });

  it("only allows 'verified against primary source' with a primary-trust source", async () => {
    const news = await createStoryFromItems([(await itemFrom("news")).id], "ed");
    await expect(updateStory(news.id, { ...fill, verificationStatus: "verified_primary" }, "ed")).rejects.toThrow(/primary/);
    const vendor = await createStoryFromItems([(await itemFrom("primary_vendor", "Vendor advisory B")).id], "ed");
    await expect(updateStory(vendor.id, { ...fill, verificationStatus: "verified_primary" }, "ed")).resolves.toBeTruthy();
  });

  it("rejects invalid CVE identifiers", async () => {
    const story = await createStoryFromItems([(await itemFrom("news")).id], "ed");
    await expect(updateStory(story.id, { ...fill, cveIds: "CVE-26-1" }, "ed")).rejects.toThrow();
  });

  it("won't remove the last source from an approved story", async () => {
    const item = await itemFrom("news");
    const story = await createStoryFromItems([item.id], "ed");
    await updateStory(story.id, fill, "ed");
    await transitionStory(story.id, "approved", "ed");
    await expect(unlinkItem(story.id, item.id, "ed")).rejects.toThrow(WorkflowError);
  });
});
