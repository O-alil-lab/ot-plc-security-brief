"use client";

import { useState } from "react";

export function SubmitForm({ correctionSlug }: { correctionSlug?: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: f.get("url"),
          note: [correctionSlug ? `Correction for story: ${correctionSlug}` : "", String(f.get("note") ?? "")].filter(Boolean).join("\n"),
          contactEmail: f.get("contactEmail"),
          website: f.get("website"),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Your submission could not be sent. Try again later.");
      setState("done");
    } catch (err) {
      setError((err as Error).message);
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div role="status" className="rounded-lg border border-teal/30 bg-teal/5 p-5">
        <p className="font-semibold">Thanks, we&apos;ve received it.</p>
        <p className="mt-1 text-sm text-slate">An editor will review your submission. If you left an email, we may contact you with questions.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <label className="block">
        <span className="mb-1 block font-medium">Link</span>
        <input name="url" type="url" required placeholder="https://" className="field" />
        <span className="mt-1 block text-sm text-slate">A link to the original advisory or report, if you have it.</span>
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">Note <span className="font-normal text-slate">(optional)</span></span>
        <textarea name="note" rows={4} maxLength={900} className="field" placeholder={correctionSlug ? "What is wrong, and what is the correct information?" : "Why is this relevant to industrial security?"} />
      </label>
      <label className="block">
        <span className="mb-1 block font-medium">Your email <span className="font-normal text-slate">(optional)</span></span>
        <input name="contactEmail" type="email" autoComplete="email" className="field" />
        <span className="mt-1 block text-sm text-slate">Only if you&apos;re happy for an editor to contact you about this submission.</span>
      </label>
      <div aria-hidden className="absolute -left-[9999px]">
        <label>
          Leave empty
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state === "error" && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button className="btn btn-primary" disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send submission"}
      </button>
    </form>
  );
}
