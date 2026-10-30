/**
 * One-command local run, no PostgreSQL or Docker install needed:
 *   npm run local
 *
 * - Starts a bundled PostgreSQL (embedded-postgres) with its data in ./.local/pgdata
 * - Creates .env on first run (random APP_SECRET, development email mode)
 * - Applies migrations, seeds the 17 sources, loads the DEMO stories on first run
 * - Creates an admin on first run and writes the sign-in to .local/ADMIN-LOGIN.txt
 * - Runs the web app (http://localhost:3000) and the background worker
 * Press Ctrl+C to stop everything cleanly. Data is kept between runs.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const ROOT = resolve(__dirname, "..");
const LOCAL = join(ROOT, ".local");
const DATA = join(LOCAL, "pgdata");
const PG_PORT = Number(process.env.LOCAL_PG_PORT ?? 54329);
const APP_PORT = Number(process.env.PORT ?? 3000);
const DB_URL = `postgresql://brief:brief@localhost:${PG_PORT}/brief`;
const isWin = process.platform === "win32";

const log = (msg: string) => console.log(`\x1b[36m[local]\x1b[0m ${msg}`);

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  const r = spawnSync(cmd, args, { cwd: ROOT, env, stdio: "inherit", shell: isWin });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (exit ${r.status})`);
}

function ensureEnvFile() {
  const path = join(ROOT, ".env");
  if (existsSync(path)) {
    const current = readFileSync(path, "utf8");
    if (!current.includes(`localhost:${PG_PORT}/brief`)) {
      log(`.env exists and points to another database. Using the bundled database for this run (DATABASE_URL overridden).`);
    }
    return;
  }
  writeFileSync(
    path,
    [
      "# Created by `npm run local`. Safe to edit. Never commit this file.",
      `DATABASE_URL=${DB_URL}`,
      `TEST_DATABASE_URL=postgresql://brief:brief@localhost:${PG_PORT}/brief_test`,
      `APP_BASE_URL=http://localhost:${APP_PORT}`,
      `APP_SECRET=${randomBytes(32).toString("hex")}`,
      "FETCH_USER_AGENT=OT-PLC-Security-Brief/0.1 (local development)",
      "EMAIL_PROVIDER=console",
      "AI_PROVIDER=none",
      "",
    ].join("\n"),
  );
  log("Created .env (development email mode: messages go to Admin > Dev mailbox).");
}

async function main() {
  mkdirSync(LOCAL, { recursive: true });
  ensureEnvFile();

  const firstRun = !existsSync(join(DATA, "PG_VERSION"));
  const pg = new EmbeddedPostgres({ databaseDir: DATA, user: "brief", password: "brief", port: PG_PORT, persistent: true, onLog: () => {} });
  if (firstRun) {
    log("First run: initialising the bundled PostgreSQL (one time)...");
    await pg.initialise();
  }
  await pg.start();
  log(`PostgreSQL running on port ${PG_PORT} (data in .local/pgdata).`);
  if (firstRun) {
    await pg.createDatabase("brief");
    await pg.createDatabase("brief_test");
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: DB_URL,
    APP_BASE_URL: process.env.APP_BASE_URL ?? `http://localhost:${APP_PORT}`,
    PORT: String(APP_PORT),
  };

  const children: ChildProcess[] = [];
  let stopping = false;
  const stop = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    log("Stopping...");
    for (const c of children) {
      if (c.pid && !c.killed) {
        if (isWin) spawnSync("taskkill", ["/pid", String(c.pid), "/T", "/F"], { stdio: "ignore" });
        else {
          try {
            process.kill(-c.pid, "SIGTERM"); // whole process group (npx -> next/tsx -> children)
          } catch {
            c.kill("SIGTERM");
          }
        }
      }
    }
    await pg.stop().catch(() => {});
    log("Stopped. Your data is kept in .local/ for next time.");
    process.exit(code);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());

  try {
    log("Applying database migrations...");
    run("npx", ["prisma", "migrate", "deploy"], env);
    run("npx", ["tsx", "scripts/seed.ts"], env);

    const loginFile = join(LOCAL, "ADMIN-LOGIN.txt");
    if (firstRun || !existsSync(loginFile)) {
      run("npx", ["tsx", "scripts/seed-demo.ts"], env);
      const email = "admin@localhost.test";
      const password = randomBytes(12).toString("base64url");
      const res = spawnSync("npx", ["tsx", "scripts/admin-create.ts", "--if-missing"], {
        cwd: ROOT,
        env: { ...env, ADMIN_EMAIL: email, ADMIN_PASSWORD: password },
        encoding: "utf8",
        shell: isWin,
      });
      if (res.stdout.includes("Admin ready")) {
        writeFileSync(
          loginFile,
          `Local admin sign-in for http://localhost:${APP_PORT}/admin\n\nEmail:    ${email}\nPassword: ${password}\n\nThis file is only on your computer (.local/ is git-ignored).\nChange the password any time with: npm run admin:create\n`,
        );
        log(`Admin created. Sign-in details saved to .local${isWin ? "\\" : "/"}ADMIN-LOGIN.txt`);
      } else {
        log("An admin already exists. Use your existing sign-in, or reset it with: npm run admin:create");
      }
    }
  } catch (e) {
    console.error(`\n[local] Setup failed: ${(e as Error).message}`);
    await stop(1);
    return;
  }

  log(`Starting the web app on http://localhost:${APP_PORT} and the background worker...`);
  // On macOS/Linux each child gets its own process group so stop() can end its whole tree.
  const opts = { cwd: ROOT, env, stdio: "inherit" as const, shell: isWin, detached: !isWin };
  const web = spawn("npx", ["next", "dev", "-p", String(APP_PORT)], opts);
  const worker = spawn("npx", ["tsx", "scripts/worker.ts"], opts);
  children.push(web, worker);
  web.on("exit", (code) => {
    if (!stopping) {
      log(`Web app exited (code ${code}).`);
      void stop(code ?? 1);
    }
  });
  worker.on("exit", (code) => {
    if (!stopping) log(`Worker exited (code ${code}). The site keeps running; restart with npm run local to resume feed polling.`);
  });
  log(`Open http://localhost:${APP_PORT} — admin at http://localhost:${APP_PORT}/admin. Press Ctrl+C to stop.`);
}

main().catch(async (e) => {
  console.error(`[local] ${(e as Error).message}`);
  process.exit(1);
});
