# OT & PLC Security Brief

A human-curated news feed and weekly newsletter for PLC, OT, ICS, SCADA and industrial cybersecurity.

The app collects items from vendor, CERT, research and news feeds into an editorial inbox. Editors write and verify stories against the original sources, publish them to a public site, and send a weekly newsletter.

Two rules hold throughout:

- **Nothing is published or emailed automatically.** Every publication and every bulk send needs an explicit action by a signed-in editor.
- **Nothing is invented.** Facts the sources don't establish (versions, exploitation, patches) are shown as unknown.

---

## Contents

1. [Architecture](#architecture)
2. [Requirements](#requirements)
3. [Quick start (local)](#quick-start-local)
4. [Demo mode vs real data](#demo-mode-vs-real-data)
5. [Environment variables](#environment-variables)
6. [Database and migrations](#database-and-migrations)
7. [Running the app and the worker](#running-the-app-and-the-worker)
8. [Tests](#tests)
9. [Editorial workflow](#editorial-workflow)
10. [Sources and ingestion](#sources-and-ingestion)
11. [Newsletter and email](#newsletter-and-email)
12. [Optional AI assistance](#optional-ai-assistance)
13. [Social import (and Agent Reach)](#social-import-and-agent-reach)
14. [Security](#security)
15. [Deployment](#deployment)
16. [Troubleshooting](#troubleshooting)
17. [Known limitations](#known-limitations)

---

## Architecture

```mermaid
flowchart LR
  subgraph Sources
    F[RSS / Atom feeds<br/>CISA, Siemens, CERT/CC, vendors, research, news]
    K[CISA KEV JSON]
    S[Social import JSON<br/>manual posts]
    C[Community submissions]
  end
  W[Worker<br/>npm run worker] -->|safe fetch + SSRF guard| F
  W --> K
  W -->|parse, dedup, relevance| DB[(PostgreSQL)]
  S --> DB
  C -->|editor promotes| DB
  DB --> I[Admin inbox]
  I -->|editor writes + verifies| ST[Story: draft → approved → published]
  ST --> P[Public site, RSS, sitemap]
  ST --> N[Newsletter issue: draft → reviewed → sending → sent]
  N -->|worker sends in batches| E[Email provider<br/>console / SMTP / Resend]
```

| Concern | Choice |
|---|---|
| Web app | Next.js 16 (App Router) + TypeScript (strict) + Tailwind CSS 4 |
| Database | PostgreSQL 16 via Prisma 6, with committed migrations |
| Background jobs | A separate worker process (`scripts/worker.ts`) that uses the database as its queue |
| Feed parsing | `rss-parser`, plus an automatic repair pass for common XML faults |
| HTTP fetching | `undici`, with an SSRF guard, DNS pinning, timeouts, a size cap, a redirect limit, retries and ETag support |
| Sanitising | `sanitize-html`. Feed text is stored as plain text and rendered as text |
| Auth | Single admin with argon2id hashes, DB-backed sessions, httpOnly cookies and CSRF tokens |
| Validation | Zod at every form and API boundary |
| Email | `EmailProvider` interface with `console` (dev, default), `smtp` (Mailpit or any server) and `resend` |
| AI | `AIProvider` interface with `none` (default) and `anthropic`. Optional |
| Tests | Vitest (unit and integration against a real Postgres test DB) and Playwright (end-to-end smoke tests) |

Code map:

```
config/            sources.ts (seed feeds), relevance.ts (keywords, weights)
prisma/            schema.prisma, migrations/
scripts/           worker, admin-create, seed, seed-demo, check-sources
src/app/(public)/  public site: home, feed, stories, newsletter archive, about, submit, privacy, unsubscribe
src/app/admin/     dashboard pages + actions.ts (all admin mutations)
src/app/api/       subscribe, confirm, unsubscribe (incl. RFC 8058 one-click), submit, admin CSV export
src/lib/           ingest/, stories/, newsletter/, subscribers/, email/, ai/, social/, auth/, kev.ts
tests/             unit/, integration/, e2e/, fixtures/feeds/
```

## Requirements

- Node.js 20.11 or newer (22 LTS recommended)
- PostgreSQL 14 or newer, either local or through the included Docker Compose file
- Optional: Docker, Mailpit (for local SMTP), an email provider account, an AI API key

## Quick start (local)

**Easiest: one command, no database install.** With Node.js 20.11 or newer installed:

```bash
npm install
npm run local
```

On Windows you can double-click `start-local.cmd` instead.

`npm run local` does the following:

- starts a bundled PostgreSQL (data kept in `.local/`);
- creates `.env`;
- applies migrations, adds the 20 sources and the DEMO stories;
- creates an admin, with the sign-in saved to `.local/ADMIN-LOGIN.txt`;
- builds the app (only on the first run or after code changes) and runs it at http://localhost:3000 with the background worker.

Add `-- --dev` (`npm run local -- --dev`) for development mode with hot reload.

Press Ctrl+C to stop.

**Manual setup** (your own PostgreSQL or Docker):


```bash
git clone <your repo> ot-plc-security-brief && cd ot-plc-security-brief
npm install
cp .env.example .env
# Edit .env:
#   DATABASE_URL=postgresql://brief:brief@localhost:5432/brief
#   TEST_DATABASE_URL=postgresql://brief:brief@localhost:5432/brief_test
#   APP_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
#   FETCH_USER_AGENT="OT-PLC-Security-Brief/0.1 (+https://your-site.example/about)"

docker compose up -d          # PostgreSQL (also creates brief_test). Skip if you run your own.
npm run db:deploy             # apply migrations
npm run db:seed               # add the 17 real seed sources
npm run seed:demo             # optional: clearly labelled DEMO stories
npm run admin:create          # prompts for admin email + password (min 12 chars)

npm run dev                   # http://localhost:3000   (admin: http://localhost:3000/admin)
npm run worker                # in a second terminal: polls feeds, sends newsletters
```

To run without Docker, create a `brief` role and the `brief` and `brief_test` databases in your own PostgreSQL, then set the two URLs.

To run the full stack in Docker (app, worker, Postgres and Mailpit), use `docker compose --profile app up -d --build`. Then run `docker compose exec app npm run admin:create`.

## Demo mode vs real data

| | Demo mode | Real data |
|---|---|---|
| How | `npm run seed:demo` | `npm run db:seed`, then the worker or “Fetch now” |
| Content | A fictional feed (`tests/fixtures/feeds/demo-feed.xml`) and 2 fictional published stories | Live feeds from vendors, CERTs, research and news |
| Labelling | Every demo record has `isDemo=true`, a **DEMO** badge everywhere, and a banner across the admin | No badge |
| Polling | The demo source is never polled | Every enabled source is polled on its own interval |
| Remove | `npm run seed:demo -- --clear` | — |

Email defaults to development mode (`EMAIL_PROVIDER=console`). Nothing is sent: messages appear in **Admin → Dev mailbox**, where confirmation links can be clicked. Production needs `EMAIL_PROVIDER=smtp` or `resend` (see [Newsletter and email](#newsletter-and-email)).

## Environment variables

All variables are documented in [`.env.example`](.env.example). Never commit `.env`.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `TEST_DATABASE_URL` | for tests | A **separate** database. The test suite truncates its tables |
| `APP_SECRET` | yes in production | 32+ random characters. Used to hash tokens and IPs. The app refuses to start in production without it |
| `APP_BASE_URL` | yes | Public URL, used in emails, RSS and canonical links |
| `FETCH_USER_AGENT` | recommended | Identify yourself to publishers with a contact URL |
| `FETCH_PROXY_URL` | no | Outbound proxy. With a proxy, DNS pinning happens at the proxy (see Security) |
| `EMAIL_PROVIDER` | no | `console` (default), `smtp` or `resend` |
| `EMAIL_FROM`, `EMAIL_REPLY_TO` | for real email | From address on your verified domain |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | for `smtp` | Mailpit: `localhost` / `1025` |
| `RESEND_API_KEY` | for `resend` | |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `AI_MODEL` | no | AI is off unless all three are set |
| `CRON_SECRET` | for `/api/cron` | 32+ characters. Enables `POST /api/cron` (background work without a worker process) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | no | Read once by `npm run admin:create` for non-interactive setup. Remove them afterwards |

## Database and migrations

- **Apply migrations** (CI and production): `npm run db:deploy`
- **Create a migration after editing `prisma/schema.prisma`**: `npm run db:migrate -- --name <change>`
- **Back up**: `pg_dump --format=custom "$DATABASE_URL" > brief-$(date +%F).dump`
- **Restore**: `pg_restore --clean --no-owner -d "$DATABASE_URL" brief-YYYY-MM-DD.dump`

In production, take daily backups and test a restore at least once.

## Running the app and the worker

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build && npm start` | Production build and server |
| `npm run worker` | Long-running worker. It checks for due sources every 5 min, sends queued newsletter deliveries every 15 s, and syncs CISA KEV every 12 h |
| `npm run worker:once` | One ingest pass and one send pass, then exits. Use it with cron or for debugging |
| `npm run sources:check` | Live-tests every seed feed without writing to the database. Prints a Markdown table |

Run **exactly one** worker. Sources are polled on their own interval, with a minimum of 30 min and a default of 60 min. After failures the interval backs off exponentially (2^failures) up to 24 h. Polling runs at most 3 sources at a time.

## Tests

```bash
npm test                 # Vitest: unit and integration (needs TEST_DATABASE_URL)
npm run lint
npm run typecheck
# End-to-end smoke tests against a running app (development email mode):
E2E_ADMIN_EMAIL=you@example.com E2E_ADMIN_PASSWORD='...' npm run test:e2e
```

The integration tests use a real PostgreSQL test database and a local HTTP fixture server. They never touch the internet. See [`PROGRESS.md`](PROGRESS.md) for the latest results.

The end-to-end tests create sample records in whichever database the app is using, so run them against a development database.

## Editorial workflow

1. **Inbox** (`/admin/inbox`). New items are sorted by relevance, with filters for source, score and keyword. Each item shows the source, its identifiers, an "updated by source" flag, duplicate groups, and a link to the original. Items that were already older than 30 days when first collected (for example a vendor feed's full history) go to **Older backlog** instead of the queue.
2. Select one or more items and choose **Create draft story**. The draft links those items as sources. It starts **unverified**, with an empty summary.
3. **Story editor**. Write the summary, why it matters, and defensive guidance with its source. Add vendors, products, versions (leave empty for "Unknown"), CVE and advisory IDs, and the verification level. **Preview public page** shows the exact public rendering.
4. **Approve**. This requires a summary and at least one linked source. "Verified against primary source" also requires a linked vendor or government CERT item.
5. **Publish**. This is only possible from Approved, and you must tick "I have checked this story against its sources". The story then appears on `/feed`, `/stories/<slug>`, the RSS feed and the sitemap.
6. **Corrections**. Edits to a published story update it in place and show an "updated" date. For larger changes, move the story back to Draft.

Every change is written to the audit log (`/admin/audit`).

Duplicates are handled like this:

- Exact matches on the same URL, and headlines from **different** sources that are very similar, are grouped automatically.
- A shared CVE or advisory ID only *suggests* a link. It never merges items.
- Editors can group items by hand or split an item out of a group (undo).

## News agent (automatic stories and newsletter)

**Admin → News agent** runs every hour from the worker, or from `POST /api/cron` when hosted. Each run:

1. **Fetches** the newest items from every due source.
2. **Selects** items that meet all of these conditions:
   - new and published in the last 7 days;
   - relevance of 45 or more, with at least one industrial term or vendor;
   - from the source types you allow (vendor advisories and government/coordinating CERTs by default).
3. **Groups** items about the same thing: shared CVE or advisory IDs, the same duplicate group, or near-identical opening text from different sources (for example a Siemens SSA and the CISA ICSA for it). If a story on the topic already exists, new sources are linked to it instead of creating a duplicate.
4. **Writes** each story. With `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`, the AI writes it from the source text only (`AI_MODEL` is optional). The draft is then checked automatically:
   - a CVE or advisory ID that isn't in the source rejects the draft;
   - so does an exploitation claim such as "actively exploited" that the source doesn't make;
   - vendors and products that aren't in the source are removed;
   - guidance without an attribution is removed.

   If the AI is off, fails, or its draft is rejected, the story uses the publisher's own wording instead.
5. **Publishes** the story, marked **Auto-generated** with "Partially verified" on the site and in emails. You can switch publishing off to get drafts instead.
6. **Sends** the weekly issue at the configured day and hour (UTC), once per week, with that week's published stories. It goes only to confirmed subscribers, and is skipped when there are too few stories.

Every run is listed with its log on the News agent page and recorded in the audit log. Use **Dry run** to preview what the agent would write without changing anything.

**To stop it:** untick "Agent switched on", or set `AGENT_DISABLED=1` and restart.

**Before relying on automatic sending:**

- Configure real email (see below). In development mode, issues go to the Dev mailbox only.
- Remember that no editor checks auto-generated stories. Review them on the Stories page; you can edit or unpublish any of them.

Vendor coverage: Siemens; Phoenix Contact, WAGO, CODESYS, Beckhoff, Pepperl+Fuchs and more through CERT@VDE; Moxa; Mitsubishi Electric; Palo Alto Networks; Fortinet; Hitachi Energy and many others through the CISA ICS advisories. See [`SOURCE_REGISTRY.md`](SOURCE_REGISTRY.md).

## Sources and ingestion

Add or edit sources in **Admin → Sources**: name, URL, RSS or Atom, trust level, category, interval and enabled. URLs are SSRF-checked when saved and again on every fetch. **Fetch now** runs a source immediately and shows the real result.

Failures are recorded with their real cause and never shown as "no new items". The possible causes are:

- HTTP errors, including 401, 403 and 429, which are reported as *Blocked*
- timeouts
- oversized responses
- malformed feeds
- unsafe addresses

The 20 seed feeds and their last live test are in [`SOURCE_REGISTRY.md`](SOURCE_REGISTRY.md). Relevance keywords and weights live in [`config/relevance.ts`](config/relevance.ts). Relevance is a triage aid, not severity.

## Newsletter and email

**Workflow** (`/admin/newsletter`):

1. Create an issue.
2. Pick and order published stories.
3. Edit the title, subject, preview text, introduction and footer.
4. Preview the issue at desktop and mobile widths, plus the plain-text version.
5. Send a test to an address you type in. It only goes to that address and is marked `[TEST]`.
6. **Mark reviewed**. Any later edit resets this.
7. **Send**: type the issue number to confirm.

The worker then sends in batches. It creates one delivery row per active subscriber, enforced by a unique constraint and an idempotency key, so an issue can't be sent twice. A failed delivery is retried up to 3 times, and the result is shown as *sent* or *partially failed*, with a retry button.

The UI says a message was "accepted by the provider", never "delivered". Inbox delivery would need provider webhooks, which are not implemented.

Subscribers can unsubscribe in two ways:

- **One-click** from their mail client, through the `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058). This posts to `/api/unsubscribe`.
- **The visible link** in each email. It opens `/unsubscribe`, which shows a confirmation button. A plain GET never changes state, so link scanners can't unsubscribe anyone.

**Subscription** uses double opt-in:

- The consent checkbox is required, and the version of the consent text is stored.
- Confirmation tokens are stored only as hashes and expire after 48 h.
- The signup form gives the same response whether or not the address exists, so it can't be used to discover subscribers.
- Signups are rate-limited per IP and protected by a honeypot field.

**Going to production with real email:**

1. **Verify your sending domain** with your provider (Resend, or any SMTP service).
2. **Publish SPF and DKIM** DNS records as your provider instructs.
3. **Add DMARC**. Start with `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain`, then tighten it to `quarantine` or `reject` once reports are clean.
4. **Set the email variables**: `EMAIL_PROVIDER`, `EMAIL_FROM` (on that domain), `EMAIL_REPLY_TO`, and the provider credentials.
5. **Check the unsubscribe headers**. The app already sends `List-Unsubscribe` and `List-Unsubscribe-Post`. Gmail and Yahoo require one-click unsubscribe for bulk senders.
6. **Test deliverability**:
   - send test issues to Gmail, Outlook and a corporate mailbox;
   - check the SPF, DKIM and DMARC results in the message headers;
   - use a tool such as mail-tester.com;
   - start with small batches.
7. **Review the law**. Check the privacy and email-marketing rules that apply to you and your readers (for example GDPR/ePrivacy, CAN-SPAM, CASL, or your local data-protection law). The privacy and unsubscribe pages are marked as draft copy for this reason.

## Optional AI assistance

Set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and `AI_MODEL` (a current Claude model name). The story editor then gets a **Suggest a draft from sources** button.

- The model sees only the linked items' titles, excerpts, publishers, dates and URLs, wrapped in delimiters and labelled as untrusted data.
- The system prompt forbids inventing CVEs, versions, exploitation, patches, dates or quotes, and requires citations and a list of unknowns.
- Suggestions are stored separately and shown as "AI suggestion — review required". They are **never** written into story fields. The editor copies what they have checked.
- Subscriber data is never sent to the AI provider.
- AI can't publish or send anything.

Status: implemented, but it needs credentials. It was not exercised against the live API during the build.

## Social import (and Agent Reach)

**Admin → Social import** accepts posts in two ways:

- a JSON file (schema below, up to 500 posts or 2 MB);
- a single post entered by hand.

Imported posts land in the inbox from a *social* source and are always **unverified**. A story built only from social posts cannot be marked as verified.

```json
{
  "version": 1,
  "posts": [
    {
      "platform": "x",
      "author": "@handle",
      "url": "https://...",
      "publishedAt": "2026-10-29T08:00:00Z",
      "text": "excerpt",
      "linkedPrimarySource": "https://..."
    }
  ]
}
```

Only `platform` and `url` are required.

The app never logs in to social networks, never stores cookies, and does not install or call [Agent Reach](https://github.com/Panniantong/Agent-Reach). To use Agent Reach, install and run it separately under your own accounts and within each platform's rules, convert its output to the schema above, and upload the file.

## Security

Implemented controls:

- **Admin authentication**: argon2id password hashing, DB-backed sessions (12 h), and httpOnly, SameSite=Lax cookies, marked Secure in production. Login is rate-limited, gives the same error for an unknown user and a wrong password, and takes constant time.
- **Authorization** is enforced in three layers:
  - a route guard (`src/proxy.ts`);
  - `requireAdminPage()` in every admin page;
  - `requireAdminAction()` in every admin action and API route, checking the session and a CSRF token on top of Next.js's own Origin check.

  The tests enumerate every action, page and admin route, so new ones are covered automatically.
- **SSRF protection** for every fetch:
  - only http and https;
  - no credentials in URLs;
  - only ports 80, 443, 8080 and 8443;
  - blocked hostnames (`localhost`, `*.internal`, metadata hosts);
  - every resolved IP must be public, which rejects private, loopback, link-local, CGNAT, multicast, reserved, IPv4-mapped, NAT64 and cloud-metadata addresses;
  - the connection is pinned to the vetted IP, which defeats DNS rebinding;
  - every redirect hop is re-validated, with at most 3 redirects.
- **Fetch limits**: 20 s timeout, 15 MB response cap, one retry with backoff for transient errors, and a configurable User-Agent.
- **Untrusted content**:
  - Feed and social text is stripped to plain text, capped in length, and rendered by React as text.
  - Links must be http(s).
  - Email HTML is escaped.
  - The CSV export guards against formula injection.
- **Headers**: Content-Security-Policy, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, and HSTS in production.
- **Privacy**:
  - Tokens are stored hashed.
  - Submitter IPs are stored only as a keyed hash.
  - Logs mask email addresses.
  - Audit metadata is redacted.
  - Subscriber exports are admin-only and audited.

**MVP simplifications to fix before production:**

| Simplification | Change for production |
|---|---|
| In-memory rate limiter (per process, reset on restart) | Use Redis or a DB-backed limiter, especially with more than one instance |
| Single admin account, no roles or MFA | Add multiple editors with roles (editor, publisher), MFA, and SSO if needed |
| No email webhooks: status is "accepted", not "delivered"; bounces aren't recorded automatically | Add provider webhooks for delivered, bounced and complained, and mark bounced subscribers |
| CSP allows `'unsafe-inline'` scripts (Next.js bootstrap) | Switch to nonce-based CSP |
| With `FETCH_PROXY_URL`, DNS pinning is done by the proxy, not the app | Use a proxy that enforces its own egress allowlist, or run without a proxy |
| Worker is a single process with no leader election | Fine for one instance. Add locking before scaling out |
| `client IP` is read from `X-Forwarded-For` | Only trust it behind your own reverse proxy, and configure it to overwrite the header |

On dependencies, `npm audit` reports 0 vulnerabilities as of 2026-10-30. `package.json` pins `deepmerge-ts` to `^8` through `overrides`. That fixes GHSA-ggr8-5vv4-36mx in the Prisma CLI's config loader; the Prisma CLI was re-checked with `validate`, `generate`, `migrate status` and `migrate deploy`. Remove the override when you upgrade to Prisma 7. Run `npm audit` regularly.

## Deployment

**Render with auto-deploy from GitHub** is set up through [`render.yaml`](render.yaml), and a free GitHub Actions schedule replaces the worker. See [`DEPLOY.md`](DEPLOY.md) for the step-by-step setup.


- **Container**: the `Dockerfile` builds one image for both roles. The app runs `npm start` and the worker runs `npm run worker`. Run `npm run db:deploy` (`prisma migrate deploy`) on each release.
- **Any Node host** works if it can run a long-lived worker next to the web app, for example a VPS, Fly.io, Render or Railway. Vercel-style serverless hosting suits the web app, but the worker needs its own process. As an alternative, schedule `npm run worker:once` with cron every 5 minutes. Sends will then be batched per run.
- **Configuration**: put TLS in front of the app and set `APP_BASE_URL` to the HTTPS URL. Set a strong `APP_SECRET`, and keep the database private.
- **Logs**: the app avoids logging emails and secrets. Keep it that way when you add logging.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Source shows **Blocked (HTTP 403/429)** | The publisher blocks automated access or your IP/User-Agent. Set a descriptive `FETCH_USER_AGENT`, increase the interval, or contact the publisher. Do not bypass access controls. |
| **Malformed feed** | The feed isn't valid XML, or returned an HTML block page. The app already repairs common faults. Check the URL in a browser. |
| **Response too large** | The feed exceeds 15 MB. Contact the publisher, or raise `maxBytes` in `src/lib/ingest/fetcher.ts` with care. |
| **Rejected: unsafe address** | The URL resolves to a private or local IP. That's intended. Only public feeds are allowed. |
| Inbox is empty | The worker isn't running. Start `npm run worker`, or use **Fetch now** on a source. |
| No confirmation email | In development, look in **Admin → Dev mailbox**. In production, check the provider dashboard and the SPF/DKIM setup. |
| Sign-in page says no admin exists | Run `npm run admin:create`. |
| Tests refuse to run | Set `TEST_DATABASE_URL` to a separate database. |

## Known limitations

- Siemens CSAF is tested as reachable (see the registry), but there is no adapter that turns CSAF documents into items. This is **not implemented**.
- Vendors without a confirmed official feed aren't seeded: Schneider Electric, Rockwell, CODESYS, ABB, Mitsubishi, CERT@VDE, Honeywell and Emerson. Add them once you have verified their URLs.
- There is no public discussion area. Community input is moderated submissions only, by design for the MVP.
- Search uses PostgreSQL `ILIKE`. Add full-text search when the archive grows.

See [`PRODUCT_PLAN.md`](PRODUCT_PLAN.md) for the roadmap and [`EDITORIAL_GUIDELINES.md`](EDITORIAL_GUIDELINES.md) for editorial rules.
