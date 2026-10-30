import { prisma } from "./db";
import { safeFetch } from "./ingest/fetcher";
import { STRUCTURED_SOURCES } from "../../config/sources";

type KevFeed = {
  catalogVersion?: string;
  vulnerabilities?: { cveID: string; vendorProject?: string; product?: string; dateAdded?: string }[];
};

/** Sync the CISA Known Exploited Vulnerabilities catalog into KevEntry. */
export async function syncKev(): Promise<{ count: number; catalogVersion: string | null }> {
  const res = await safeFetch(STRUCTURED_SOURCES.cisaKev, { maxBytes: 20 * 1024 * 1024, accept: "application/json" });
  let data: KevFeed;
  try {
    data = JSON.parse(res.body) as KevFeed;
  } catch {
    throw new Error("KEV feed was not valid JSON");
  }
  const vulns = (data.vulnerabilities ?? []).filter((v) => /^CVE-\d{4}-\d{4,7}$/.test(v.cveID));
  if (!vulns.length) throw new Error("KEV feed contained no vulnerabilities; keeping previous data");
  await prisma.$transaction([
    prisma.kevEntry.deleteMany({}),
    prisma.kevEntry.createMany({
      data: vulns.map((v) => ({
        cveId: v.cveID,
        vendor: v.vendorProject?.slice(0, 200) ?? null,
        product: v.product?.slice(0, 200) ?? null,
        dateAdded: v.dateAdded ? new Date(v.dateAdded) : null,
      })),
      skipDuplicates: true,
    }),
    prisma.appSetting.upsert({
      where: { key: "kev.lastSync" },
      create: { key: "kev.lastSync", value: { at: new Date().toISOString(), count: vulns.length, catalogVersion: data.catalogVersion ?? null } },
      update: { value: { at: new Date().toISOString(), count: vulns.length, catalogVersion: data.catalogVersion ?? null } },
    }),
  ]);
  return { count: vulns.length, catalogVersion: data.catalogVersion ?? null };
}

export async function kevMatches(cveIds: string[]): Promise<string[]> {
  if (!cveIds.length) return [];
  const rows = await prisma.kevEntry.findMany({ where: { cveId: { in: cveIds } }, select: { cveId: true } });
  return rows.map((r) => r.cveId);
}
