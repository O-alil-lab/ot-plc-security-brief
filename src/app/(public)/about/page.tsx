import Link from "next/link";
import type { Metadata } from "next";
import { VerificationLamp } from "@/components/Lamp";

export const metadata: Metadata = { title: "About and editorial standards" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">About and editorial standards</h1>
      <div className="prose-brief mt-6 space-y-8">
        <section>
          <h2 className="mb-2 text-xl font-semibold">What we cover</h2>
          <p>PLC, OT, ICS, SCADA and HMI security; industrial networks and protocols; critical infrastructure; vendor and government advisories; incidents and threat intelligence that affect industrial operations; and defensive research and tools.</p>
          <p>We write for automation and PLC engineers, ICS security analysts, industrial SOC teams, asset owners, integrators and researchers.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">How we choose sources</h2>
          <p>We monitor vendor product-security teams, government CERTs, OT security researchers and trade press. Primary sources (the vendor or the coordinating CERT) come first. News and social posts help us find stories, but we do not treat them as confirmation.</p>
          <p>We store only the title, short summary, link and dates that each feed publishes, and link to the original. We do not republish full articles.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">How stories are labelled</h2>
          <ul className="space-y-3">
            <li><VerificationLamp status="verified_primary" /><p className="mt-1">The key facts were checked against a vendor or government CERT advisory linked on the story.</p></li>
            <li><VerificationLamp status="partially_verified" /><p className="mt-1">Some facts are confirmed. Anything we could not confirm is marked unknown.</p></li>
            <li><VerificationLamp status="unverified" /><p className="mt-1">Reported by others and not yet confirmed. We say so plainly.</p></li>
          </ul>
          <p className="mt-3">We never invent CVEs, product names, versions, dates, exploitation claims, patches or quotes. If a source does not say it, we write &ldquo;unknown&rdquo;.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">How we use AI</h2>
          <p>Software collects items from feeds and gives each one a relevance score so editors can triage faster. The score is not a severity rating. If AI assistance is switched on, it can suggest a draft summary from the source text. Suggestions are labelled, are never published automatically, and an editor checks every fact against the sources before approving a story.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">Human review and corrections</h2>
          <p>Nothing is published or emailed without an editor approving it. When we get something wrong we correct the story, show an &ldquo;updated&rdquo; date, and keep the original sources visible.</p>
          <p>To report an error or send us a story, use the <Link href="/submit">submission form</Link> or reply to any newsletter.</p>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">Safety</h2>
          <p>Our defensive guidance repeats what the vendor or advisory recommends and says who recommended it. Follow your own change-management and safety processes before changing any live industrial system.</p>
        </section>
      </div>
    </div>
  );
}
