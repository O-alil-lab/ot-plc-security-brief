# Progress

Build log for the MVP described in [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md). Last updated: 2026-10-30.

## Milestones

| # | Milestone | Status | Verified by |
|---|---|---|---|
| 0 | Inspect, plan, scaffold | Done | Empty folder; Next.js scaffold, `PRODUCT_PLAN.md`, Docker Compose, `.env.example`, lint and test tooling |
| 1 | Data model and seed | Done | 2 migrations applied; `npm run db:seed` (17 sources); `npm run seed:demo` (DEMO feed and 2 stories) |
| 2 | Ingestion | Done | 52 unit and 19 fetcher/ingest integration tests; a live pass over all 17 feeds (about 2,000 items, 0 failures) |
| 3 | Admin dashboard | Done | Auth test enumerates every action, page and admin route; screenshots reviewed; e2e flow |
| 4 | Public site | Done | Screenshots at desktop and 390 px mobile; e2e mobile overflow check; RSS and sitemap served |
| 5 | Subscriptions and newsletter | Done | Integration tests for double opt-in, enumeration, unsubscribe, test send, typed confirmation, idempotency, partial failure and retry; e2e subscribe → confirm |
| 6 | AI and social import | Done (AI needs credentials) | Social import tests; AI provider unit tests with `none`; live Anthropic call **not** exercised |
| 7 | Structured feeds | KEV done; CSAF not implemented | Live KEV sync (1,766 entries) and badge lookup; CSAF reachable, no adapter |
| 8 | Hardening, docs, verification | Done | Headers and CSP configured; `npm audit` 0 vulnerabilities; Docker image built and run; docs written |

## Latest verification (2026-10-30)

| Check | Command | Result |
|---|---|---|
| Unit + integration tests | `npm test` | **125 passed, 0 failed**, 13 files |
| End-to-end smoke tests | `npm run test:e2e` (prod build, dev email mode) | **5 passed** |
| Lint | `npm run lint` | 0 problems |
| Type check | `npm run typecheck` | 0 errors |
| Production build | `npm run build` | OK |
| Dependency audit | `npm audit` | 0 vulnerabilities (with the `deepmerge-ts` override) |
| Live feeds | `npm run sources:check` | 17/17 feeds OK; KEV and CSAF JSON reachable |
| Docker | `docker compose up -d db`; image build and run | DB healthy, test DB created; image serves `/`, `/admin` redirect and `/feed.xml` |

The end-to-end flow covers:

- import a fixture (social JSON) into the inbox;
- create a draft story, then save, approve and publish it;
- see it on the public feed, labelled Unverified, with the safety note;
- build a newsletter issue and preview it at desktop width;
- send a test email to the Dev mailbox, and check that bulk send stays disabled until review;
- subscribe without consent (rejected), then with consent, confirm through the Dev mailbox link, and see the subscriber active in admin;
- send a community submission and see it queued for review;
- check that public pages don't scroll sideways on a Pixel 7 viewport.

## Hosting (2026-10-30)

- Render Blueprint (`render.yaml`), `npm run start:hosted`, `POST /api/cron`, `/api/health` and a GitHub Actions schedule were added.
- Verified locally with a production build on a fresh database. The start sequence ran migrations, seeded sources and created the admin, then a second run skipped admin creation. Health returned OK, cron rejected requests without the token, and a cron run with the token ingested 8 sources and synced KEV in 23 s. Admin sign-in worked.
- Tests: 129 passed.

## Error sweep and fixes (2026-10-30, evening)

- **Fixed:** the inbox Investigate / Reject / Back to new buttons used one shared action and passed the status in the button's `name`/`value`. React replaces a button's `name` when it has its own formAction, so the status could be lost; this also caused a hydration-mismatch error. Each button now has its own action. A new e2e test covers all three.
- **Fixed:** a fresh `npm ci` didn't generate the Prisma client, so local setup failed on Windows. A `postinstall` script now runs `prisma generate`, and `npm run local` also runs it.
- **Changed:** `npm run local` now runs the production build: built once, rebuilt only after code changes. It is much faster and doesn't show the dev overlay; that overlay was behind the metadata hydration warning seen on the first Windows page load. `--dev` keeps hot-reload mode.
- **Fixed (Windows):** closing the launcher window didn't stop the web server and worker, which kept running and kept the window open.
  - Both now run under `scripts/guard.cjs`, which ends their process tree within about 2 seconds of the launcher disappearing.
  - The launcher also handles the window-close signals (SIGHUP/SIGBREAK).
  - A database left over from a killed session is detected (after checking it really is PostgreSQL) and stopped on the next start.
  - If port 3000 is already in use, the launcher picks the next free port and says which one.
  - Verified by hard-killing the launcher: the web server and worker exit within 6 s, and the next start recovers. After Ctrl+C, no processes are left.
- **Added:** a branded 404 page.
- **Verified:**
  - an automated sweep of 37 public and admin URLs, in dev and production builds, found 0 console errors, 0 page errors, 0 Next.js issues and 0 server errors (only intentional 404s);
  - 131 unit and integration tests pass (2 more because the authorization test now covers the new inbox actions);
  - 6 e2e tests pass, including review, typed confirmation and the worker sending an issue;
  - lint, typecheck and production build pass.

## News agent (2026-10-31)

- **Added:** an automatic news agent: fetch → select → group → write (AI, validated against the source) → publish → weekly send. It has an admin page with settings, a dry run, run history and an off switch, and runs hourly from the worker and from `/api/cron`.
- **Added:** 3 official vendor feeds (CERT@VDE, Moxa, Mitsubishi Electric PSIRT), taken from links on the vendors' own sites and live-tested.
- **Fixed:** the worker didn't load `.env`. In local mode, newsletter unsubscribe links were signed with a fallback key the website rejects. The worker and scripts now load `.env`, and `dotenv` is a runtime dependency.
- **Live check against real feeds:**
  - 20 sources fetched and 745 new items collected; the Fortinet feed had a network reset, which was recorded as a failure.
  - 8 real advisories were published. The Siemens SSA and the CISA ICSA for the same Mendix issue were merged into one story.
  - Text-cleaning fixes came out of this check: CISA's "View CSAF Summary" prefix, Siemens title prefixes, cutting at sentence boundaries, and naming the vendor in headlines that start with CVE IDs.
- **Tests:** 153 unit and integration tests pass (16 new for the agent, including fake-AI hallucination and failure cases); 7 e2e tests pass; the page sweep is clean.
- **Not exercised:** a live Anthropic API call, because no key is available in the build environment. The parsing and validation of AI output are covered by tests.
- **Audit:** production dependencies have 0 vulnerabilities. One moderate advisory affects `minimatch`, which ESLint uses (development only); the fix requires a breaking ESLint change.

## Integration status

| Integration | Status |
|---|---|
| RSS/Atom ingestion (17 seed feeds) | **Tested** (live, from a cloud environment through an egress proxy) |
| CISA KEV sync and badge | **Tested** (live) |
| Email: `console` dev mailbox | **Tested** |
| Email: `smtp` (Mailpit or other) | **Implemented, needs a server.** Not exercised |
| Email: `resend` | **Implemented, needs credentials.** Not exercised |
| AI suggestions (`anthropic`) | **Implemented, needs credentials.** Not exercised against the live API |
| Social import (JSON and manual) | **Tested** |
| Agent Reach | **Not implemented** by design. Export its results and use the JSON import |
| Siemens CSAF adapter | **Not implemented** |
| Email delivery webhooks | **Not implemented** |
| GitHub Actions CI | **Tested.** First run on GitHub passed (lint, typecheck, 125 tests, build) |

## Decisions

- **Next.js 16** instead of 15: the version 15 scaffold pulled a PostCSS advisory. Next 16 renames middleware to `src/proxy.ts`.
- **Prisma 6** (not 7) for its stable `prisma-client-js` workflow. `deepmerge-ts` is overridden to `^8` to clear an advisory in the CLI.
- **Database as the job queue** instead of pg-boss. FetchRun and NewsletterDelivery rows already hold the state, so a crashed worker resumes cleanly with fewer moving parts. The prompt suggested pg-boss; this is a deliberate deviation.
- **Admin mutations are server actions**, each guarded by session and CSRF checks inside `guarded()`. Read-only admin APIs use route handlers.
- **Fetch size cap of 15 MB**: CISA ICS Advisories is about 6 MB because it embeds full advisories.
- **Deduplication tightened after live data**:
  - Headline similarity only compares items from different sources.
  - Similarity is skipped when both items carry identifiers that don't overlap.
  - Without these rules, separate Siemens SSAs and CISA's recurring "Adds N KEVs" alerts were merged wrongly.
- **Archived backlog**: items already older than 30 days when first collected go to `archived`. Without it, Siemens's 1,160-item history flooded the inbox.
- **Confirmation and visible unsubscribe need a button press** (POST). Email link scanners must not be able to change subscription state. One-click unsubscribe from mail clients uses RFC 8058 POST.
- **Tests never reset the database with `prisma migrate reset`**: Prisma blocks that for automated agents. The suite runs `migrate deploy` on a dedicated test DB and truncates its tables between files.

## Known issues and next steps

See README → "MVP simplifications to fix before production" and `PRODUCT_PLAN.md` → roadmap.
