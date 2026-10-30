import type { Metadata } from "next";

export const metadata: Metadata = { title: "Community guidelines" };

const RULES = [
  ["Never share passwords, session cookies, API keys or other credentials.", "Not your own, and not anyone else's."],
  ["Don't post sensitive plant or network details.", "No IP addresses, network diagrams, asset inventories or site locations that could help an attacker."],
  ["Don't share private customer or employee data.", "Redact names, contracts and incident details that aren't public."],
  ["No spam or undisclosed promotion.", "If you work for a vendor you mention, say so."],
  ["Don't publish unapproved vulnerability details.", "Report new vulnerabilities to the vendor or a coordinating CERT first. We only cover vulnerabilities that are already publicly disclosed."],
  ["No personal attacks.", "Disagree about facts and methods, not people."],
];

export default function GuidelinesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold">Community guidelines</h1>
      <p className="mt-3 max-w-[62ch] text-slate">
        Readers help us find stories and fix mistakes. An editor reviews every submission before anything becomes public. These rules keep that safe for everyone.
      </p>
      <ul className="mt-8 space-y-5">
        {RULES.map(([rule, detail]) => (
          <li key={rule} className="border-l-2 border-teal pl-4">
            <p className="font-semibold">{rule}</p>
            <p className="text-slate">{detail}</p>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-sm text-slate">Submissions that break these rules are deleted. Repeated spam is blocked.</p>
    </div>
  );
}
