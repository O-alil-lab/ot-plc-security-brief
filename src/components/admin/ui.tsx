import type { FetchStatus, Source } from "@prisma/client";

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export type Health = "ok" | "warn" | "fail" | "never" | "off";

export function sourceHealth(s: Pick<Source, "enabled" | "lastStatus" | "lastSuccessAt" | "lastAttemptAt" | "consecutiveFailures" | "pollIntervalMinutes">): Health {
  if (!s.enabled) return "off";
  if (!s.lastAttemptAt) return "never";
  if (s.lastStatus && s.lastStatus !== "ok") return s.consecutiveFailures >= 3 ? "fail" : "warn";
  const stale = s.lastSuccessAt && Date.now() - s.lastSuccessAt.getTime() > Math.max(s.pollIntervalMinutes, 60) * 4 * 60_000;
  return stale ? "warn" : "ok";
}

const HEALTH: Record<Health, { label: string; cls: string }> = {
  ok: { label: "Healthy", cls: "bg-lamp-green ring-lamp-green/25" },
  warn: { label: "Needs attention", cls: "bg-lamp-amber ring-lamp-amber/25" },
  fail: { label: "Failing", cls: "bg-danger ring-danger/25" },
  never: { label: "Not fetched yet", cls: "bg-white border border-slate ring-slate/20" },
  off: { label: "Disabled", cls: "bg-slate-300 ring-slate-300/40" },
};

export function HealthLamp({ health }: { health: Health }) {
  const h = HEALTH[health];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm">
      <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ring-4 ${h.cls}`} />
      {h.label}
    </span>
  );
}

export const FETCH_STATUS_LABEL: Record<FetchStatus, string> = {
  ok: "OK",
  http_error: "HTTP error",
  timeout: "Timed out",
  parse_error: "Malformed feed",
  blocked: "Blocked / access denied",
  ssrf_rejected: "Rejected: unsafe address",
  too_large: "Response too large",
  network_error: "Network error",
};

export function fmtDateTime(d: Date | null | undefined) {
  if (!d) return "—";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function ago(d: Date | null | undefined) {
  if (!d) return "never";
  const m = Math.round((Date.now() - d.getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-slate">{children}</div>}
    </div>
  );
}
