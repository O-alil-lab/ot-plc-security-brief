import { z } from "zod";
import type { Prisma, TrustLevel } from "@prisma/client";
import { prisma } from "../db";

/** News agent settings, editable in Admin > News agent and stored in AppSetting. */
export const agentSettingsSchema = z.object({
  /** Master switch. Nothing runs when false. */
  enabled: z.boolean().default(true),
  /** Publish the stories it writes. When false they stay as drafts for an editor. */
  autoPublish: z.boolean().default(true),
  /** Build and send the weekly issue automatically. */
  autoSend: z.boolean().default(true),
  /** Weekly send time (UTC). 0 = Sunday ... 6 = Saturday. */
  sendWeekday: z.number().int().min(0).max(6).default(1),
  sendHourUtc: z.number().int().min(0).max(23).default(7),
  /** Only items at or above this relevance score (0-100) are considered. */
  minRelevance: z.number().int().min(0).max(100).default(45),
  /** Only items published within this many days. */
  lookbackDays: z.number().int().min(1).max(30).default(7),
  /** Cap on stories written per run (limits AI cost and noise). */
  maxStoriesPerRun: z.number().int().min(1).max(50).default(8),
  /** Cap on stories per newsletter issue. */
  maxStoriesPerIssue: z.number().int().min(1).max(30).default(12),
  /** Which kinds of source the agent may write from. Primary sources only by default. */
  trustLevels: z.array(z.enum(["primary_vendor", "government_cert", "research", "news"])).min(1).default(["primary_vendor", "government_cert"]),
  /** Never send an issue with fewer stories than this. */
  minStoriesPerIssue: z.number().int().min(1).max(30).default(1),
});

export type AgentSettings = z.infer<typeof agentSettingsSchema>;
const KEY = "agent.settings";

export async function getAgentSettings(): Promise<AgentSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const parsed = agentSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : agentSettingsSchema.parse({});
}

export async function saveAgentSettings(input: Partial<AgentSettings>): Promise<AgentSettings> {
  const current = await getAgentSettings();
  const next = agentSettingsSchema.parse({ ...current, ...input });
  await prisma.appSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next as unknown as Prisma.InputJsonValue },
    update: { value: next as unknown as Prisma.InputJsonValue },
  });
  return next;
}

/** Environment kill switch: AGENT_DISABLED=1 stops the agent regardless of settings. */
export function agentDisabledByEnv(): boolean {
  return ["1", "true", "yes"].includes((process.env.AGENT_DISABLED ?? "").toLowerCase());
}

export const TRUST_LABEL: Record<TrustLevel, string> = {
  primary_vendor: "Vendor advisories",
  government_cert: "Government / coordinating CERTs",
  research: "Security research",
  news: "News sites",
  social: "Social",
  community: "Community",
};
