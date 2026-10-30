import type { VerificationStatus } from "@prisma/client";

const LABEL: Record<VerificationStatus, string> = {
  verified_primary: "Verified against primary source",
  partially_verified: "Partially verified",
  unverified: "Unverified",
};

/** Panel-style indicator lamp for verification status. Text always accompanies colour. */
export function VerificationLamp({ status, compact = false }: { status: VerificationStatus; compact?: boolean }) {
  const lamp =
    status === "verified_primary"
      ? "bg-lamp-green ring-lamp-green/25"
      : status === "partially_verified"
        ? "bg-lamp-amber ring-lamp-amber/25"
        : "bg-white ring-slate/40 border border-slate";
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate">
      <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ring-4 ${lamp}`} />
      {compact ? LABEL[status].replace(" against primary source", "") : LABEL[status]}
    </span>
  );
}

export function DemoBadge() {
  return (
    <span className="inline-block rounded border border-lamp-amber/40 bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-lamp-amber" title="Fictional sample data for demo mode">
      DEMO
    </span>
  );
}

export function verificationLabel(status: VerificationStatus) {
  return LABEL[status];
}
