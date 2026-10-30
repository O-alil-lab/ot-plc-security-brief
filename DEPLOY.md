# Deploying to Render (auto-deploy from GitHub)

This repository includes a Render Blueprint ([`render.yaml`](render.yaml)). Once the Blueprint is connected, every push to `main` redeploys the site.

| Piece | Where it runs | Cost |
|---|---|---|
| Web app (public site + admin) | Render web service, built from the `Dockerfile` | Free plan |
| Database | Neon Postgres (or any PostgreSQL) | Neon free plan |
| Feed polling, newsletter sending, KEV sync | GitHub Actions ([`.github/workflows/cron.yml`](.github/workflows/cron.yml)) calls `POST /api/cron` every 30 minutes | Free |

On start, the app runs `npm run start:hosted`. It applies migrations, seeds the 17 sources, creates the first admin (only if none exists), then starts the server.

## Free-plan behaviour to know

- **Sleep.** Render's free web services sleep after 15 minutes without traffic. The first visit after that takes about a minute. The scheduled GitHub job wakes the site every 30 minutes.
- **Memory and CPU.** The free instance has 512 MB of RAM and 0.1 CPU. Pages are slower than on a paid instance, but the app works.
- **Database.** Don't use Render's free Postgres for real data, because it is deleted after 30 days. Neon's free plan doesn't expire.
- **Upgrading.** For an always-on site, switch the web service to Render's Starter plan. You can also add a Render background worker running `npm run worker` and disable the GitHub schedule.

## One-time setup

### 1. Create the database (Neon)

1. Sign in at neon.tech and create a project in a region close to your Render region, e.g. Frankfurt with Render Frankfurt.
2. Copy the **direct** connection string, which has no `-pooler` in the host name. It looks like `postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
3. Keep the string private and don't paste it anywhere except Render.

### 2. Create the Render Blueprint

1. Sign in at dashboard.render.com and connect your GitHub account.
2. Choose **New → Blueprint** and select `O-alil-lab/ot-plc-security-brief`.
3. Render reads `render.yaml` and asks for the values marked `sync: false`:
   - `DATABASE_URL`: the Neon connection string.
   - `ADMIN_EMAIL`: your admin sign-in email.
   - `ADMIN_PASSWORD`: at least 12 characters.
4. Choose **Apply**. Render builds the Docker image, which takes a few minutes. When it is live, the site is at `https://ot-plc-security-brief.onrender.com`, or a similar URL that Render shows.
5. Sign in at `/admin` with your admin email and password. Then delete the `ADMIN_PASSWORD` variable in Render (**Environment** tab). The admin already exists, and the password is stored only as a hash.

### 3. Turn on the scheduled background work (GitHub)

1. In Render, open the service, go to **Environment**, and reveal and copy the generated `CRON_SECRET`.
2. In GitHub, go to the repo's **Settings → Secrets and variables → Actions** and set:
   - a **Secret** named `CRON_SECRET`, with the value you copied;
   - a **Variable** named `APP_URL`, with your Render URL (for example `https://ot-plc-security-brief.onrender.com`, no trailing slash).
3. Go to **Actions → Scheduled background work → Run workflow** to trigger the first run. It should finish with a JSON summary of fetched sources.

Until both values exist, the scheduled workflow skips itself without failing.

### 4. Before real readers sign up

- Configure real email. Set `EMAIL_PROVIDER` to `resend` or `smtp`, plus `EMAIL_FROM` and the provider credentials. Also set up SPF, DKIM and DMARC (see README → Newsletter and email). Until then, confirmation emails only appear in Admin → Dev mailbox, so real sign-ups can't confirm.
- Optional: set `APP_BASE_URL` if you add a custom domain. Otherwise the app uses Render's URL automatically.
- Review the draft privacy and unsubscribe pages for the law that applies to you.

## Other hosts

Any host that runs a Docker container and gives it a `DATABASE_URL` works. Use `npm run start:hosted` as the start command. Then either run `npm run worker` as a second process, or call `POST /api/cron` on a schedule with `Authorization: Bearer $CRON_SECRET`.
