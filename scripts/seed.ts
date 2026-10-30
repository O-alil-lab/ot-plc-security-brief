/** Seed the real source registry. Safe to run repeatedly (upsert by URL). */
import { prisma } from "../src/lib/db";
import { SEED_SOURCES } from "../config/sources";

async function main() {
  for (const s of SEED_SOURCES) {
    await prisma.source.upsert({
      where: { url: s.url },
      create: { ...s, pollIntervalMinutes: s.pollIntervalMinutes ?? 60 },
      update: { name: s.name, type: s.type, trustLevel: s.trustLevel, category: s.category },
    });
  }
  console.log(`Seeded ${SEED_SOURCES.length} sources.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
