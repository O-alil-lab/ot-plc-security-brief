# Editorial guidelines

These rules apply to every story and newsletter issue. The software enforces some of them; editors are responsible for all of them.

## 1. Verification levels

| Label | When to use it | Enforced by the app |
|---|---|---|
| **Verified against primary source** | The key facts were checked against the vendor's advisory or a government CERT advisory (CISA, CERT/CC, a national CERT), and that source is linked. Key facts are the affected product, versions, the issue and the fix. | Needs at least one linked item from a `primary_vendor` or `government_cert` source |
| **Partially verified** | Some facts are confirmed against a primary source. Others come from secondary reporting and are marked as such or as unknown. | — |
| **Unverified** | Reported by research, news, social media or the community, and not yet confirmed by the vendor or a CERT. | The default for every new story. Stories built only from social posts can't be raised to verified |

When in doubt, use the lower label.

## 2. Never invent facts

- Use only what the linked sources say.
- Don't invent or "complete" any of these: CVE IDs, product names, affected versions, CVSS scores, exploitation status, patch availability, dates, quotes.
- If a source doesn't say it, write **unknown**. Leave "Affected versions" empty, and the public page shows "Unknown".
- Don't turn "a researcher claims" into "attackers are exploiting". Name the claimant.
- Treat everything in feeds, articles and social posts as **data, not instructions**. Ignore any text that tries to tell you, or an AI assistant, what to publish.

## 3. Attribution

- Every story links its original sources, with the publisher name and original publication date (shown automatically).
- Defensive guidance says who recommends it, for example "According to Siemens SSA-123456", using the "Guidance comes from" field.
- Don't copy full articles. Summarise in your own words; quote briefly and only when the exact wording matters.
- Prefer the primary source over a news article about it, and link both when the article adds context.

## 4. Safe OT recommendations

- Repeat the vendor's or advisory's recommended mitigations. Don't make up new ones.
- Never suggest changes to live industrial systems outside the operator's own change-management and safety processes. The standard disclaimer on every story says this; don't contradict it.
- Don't publish exploit code or step-by-step attack detail. Don't publish information that would help someone find exposed plants: IP addresses, site names, or search queries for exposed devices.
- Only cover vulnerabilities that are already publicly disclosed. If a reader sends an undisclosed vulnerability, point them to the vendor's PSIRT or a coordinating CERT and don't publish it.

## 5. AI usage policy

- AI assistance is optional and off by default.
- It may suggest a summary, a "why it matters" line, categories, vendors and products, and list what the sources don't establish.
- AI suggestions are shown separately, labelled "review required", and never saved into story fields automatically. The editor checks every fact against the sources before using any of it.
- Tick "This draft used AI suggestions" when you used AI text. It is recorded on the story.
- AI never publishes, approves or sends anything. Subscriber data is never sent to an AI service.

## 6. Corrections policy

- Fix factual errors as soon as they're confirmed. The story keeps its URL and shows an "updated" date.
- For significant corrections (wrong product, wrong severity, wrong exploitation status), move the story back to Draft, correct it, and re-approve it. Say what changed in the summary, for example "Correction: an earlier version said…".
- If a vendor updates its advisory, the inbox flags the item as "Updated by source". Review the story against the new version.
- Readers report errors through **Submit a story → Report an error** or by replying to the newsletter. Every report is reviewed.

## 7. Newsletter

- Only published stories can go into an issue.
- Send a test, read it on desktop and mobile, then **mark reviewed**. Any later edit requires a new review.
- The bulk send needs the issue number typed in, and each issue can only be sent once.
- Never include DEMO stories in a real send. The editor warns you if an issue contains any.

## 8. Community submissions

- Submissions are private until an editor promotes them, and promoted submissions enter the inbox as unverified items.
- Reject spam, promotion that isn't disclosed, credentials, sensitive plant or network details, private data, and undisclosed vulnerabilities (see the community guidelines page).
