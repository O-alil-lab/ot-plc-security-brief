/**
 * Load (or with --clear, remove) clearly labelled DEMO data.
 *   npm run seed:demo
 *   npm run seed:demo -- --clear
 * Demo records have isDemo=true and show a DEMO badge everywhere.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { parseFeed } from "../src/lib/ingest/parse";
import { upsertItems } from "../src/lib/ingest/ingest";

const DEMO_SOURCE_NAME = "DEMO — Fictional Industrial Advisories";

async function clear() {
  await prisma.newsletterIssue.deleteMany({ where: { isDemo: true } });
  await prisma.story.deleteMany({ where: { isDemo: true } });
  await prisma.source.deleteMany({ where: { isDemo: true } });
  console.log("Demo data removed.");
}

async function seed() {
  const source =
    (await prisma.source.findFirst({ where: { name: DEMO_SOURCE_NAME, isDemo: true } })) ??
    (await prisma.source.create({
      data: { name: DEMO_SOURCE_NAME, type: "rss", trustLevel: "primary_vendor", category: "demo", enabled: false, isDemo: true },
    }));
  const xml = readFileSync(join(__dirname, "../tests/fixtures/feeds/demo-feed.xml"), "utf8");
  const feed = await parseFeed(xml);
  const res = await upsertItems(source, feed.items);
  await prisma.source.update({ where: { id: source.id }, data: { lastStatus: "ok", lastSuccessAt: new Date(), lastAttemptAt: new Date() } });

  const items = await prisma.collectedItem.findMany({ where: { sourceId: source.id }, orderBy: { publishedAt: "asc" } });
  const byGuid = (g: string) => items.find((i) => i.guid === g)!;

  const stories = [
    {
      guid: "demo-adv-001",
      slug: "demo-flowlogix-plc-authentication-bypass",
      headline: "[DEMO] FlowLogix PLC web interface authentication bypass",
      summary:
        "FICTIONAL SAMPLE STORY. Example Automation Co. (a fictional vendor) describes an authentication bypass in the web interface of its FlowLogix PLC firmware. An attacker with network access to the controller could change its configuration.",
      whyItMatters:
        "Demo text: PLC web interfaces are often reachable from engineering networks. A configuration change could affect a physical process.",
      defensiveGuidance: "Restrict access to the PLC web interface to the engineering network.",
      guidanceSource: "Example Automation Co. demo advisory",
      vendors: ["Example Automation Co."],
      products: ["FlowLogix PLC"],
      categories: ["vendor-advisories"],
      verificationStatus: "verified_primary" as const,
    },
    {
      guid: "demo-research-003",
      slug: "demo-hmi-ransomware-playbook-water",
      headline: "[DEMO] Researchers describe ransomware playbook aimed at HMI workstations",
      summary: "FICTIONAL SAMPLE STORY. A demo research write-up discusses how HMI workstations can be hardened and segmented.",
      whyItMatters: "Demo text: HMI workstations bridge IT and OT, which makes them attractive to ransomware operators.",
      defensiveGuidance: "",
      guidanceSource: "",
      vendors: [],
      products: [],
      categories: ["ot-research"],
      verificationStatus: "partially_verified" as const,
    },
  ];

  for (const s of stories) {
    const item = byGuid(s.guid);
    const { guid: _g, ...data } = s;
    await prisma.story.upsert({
      where: { slug: s.slug },
      create: {
        ...data,
        isDemo: true,
        editorialStatus: "published",
        approvedAt: new Date(),
        publishedAt: item.publishedAt ?? new Date(),
        sources: { create: [{ itemId: item.id }] },
      },
      update: {},
    });
    await prisma.collectedItem.update({ where: { id: item.id }, data: { inboxStatus: "used" } });
  }
  console.log(`Demo data loaded: ${res.itemsNew} new items, ${stories.length} published DEMO stories.`);
}

(process.argv.includes("--clear") ? clear() : seed())
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
