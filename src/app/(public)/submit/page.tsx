import type { Metadata } from "next";
import Link from "next/link";
import { SubmitForm } from "@/components/SubmitForm";

export const metadata: Metadata = { title: "Submit a story" };

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ correction?: string }> }) {
  const { correction } = await searchParams;
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">{correction ? "Report an error" : "Submit a story"}</h1>
      <p className="mt-3 max-w-[60ch] text-slate">
        Send us a link to an advisory, incident report or research we should look at. An editor reviews every submission; nothing you send is published automatically.
      </p>
      <p className="mt-2 text-sm text-slate">
        Please read the <Link href="/community-guidelines">community guidelines</Link> first. Don&apos;t include credentials, internal network details or undisclosed vulnerabilities.
      </p>
      <div className="mt-8">
        <SubmitForm correctionSlug={correction?.slice(0, 120)} />
      </div>
    </div>
  );
}
