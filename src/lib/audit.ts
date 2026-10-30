import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

const REDACT_KEYS = /pass|token|secret|cookie|email|key/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        REDACT_KEYS.test(k) ? "[redacted]" : redact(v),
      ]),
    );
  }
  return value;
}

export async function audit(
  actor: string,
  action: string,
  objectType: string,
  objectId?: string | null,
  metadata?: Record<string, unknown>,
) {
  await prisma.auditEvent.create({
    data: {
      actor,
      action,
      objectType,
      objectId: objectId ?? null,
      metadata: metadata ? (redact(metadata) as Prisma.InputJsonValue) : undefined,
    },
  });
}
