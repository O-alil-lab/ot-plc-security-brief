"use client";

import { useState } from "react";

export const CONSENT_LABEL =
  "I agree to receive the OT & PLC Security Brief newsletter by email. I can unsubscribe at any time with one click.";

export function SignupForm({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), consent: form.get("consent") === "on", website: form.get("website") }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Subscription failed. Try again in a few minutes.");
      setState("done");
      setMessage(body.message ?? "");
    } catch (err) {
      setState("error");
      setMessage((err as Error).message);
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="rounded-md border border-teal/30 bg-teal/5 p-4 text-sm text-ink">
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div className={compact ? "flex flex-col gap-2 sm:flex-row" : "flex flex-col gap-2 sm:flex-row"}>
        <label htmlFor="signup-email" className="sr-only">
          Email address
        </label>
        <input id="signup-email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" className="field sm:max-w-xs" />
        <button type="submit" className="btn btn-primary justify-center" disabled={state === "sending"}>
          {state === "sending" ? "Subscribing…" : "Subscribe"}
        </button>
      </div>
      {/* Honeypot field for bots; hidden from people and assistive tech */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label>
          Leave empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex max-w-md items-start gap-2 text-sm text-slate">
        <input type="checkbox" name="consent" required className="mt-1 accent-teal" />
        <span>{CONSENT_LABEL}</span>
      </label>
      {state === "error" && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
    </form>
  );
}
