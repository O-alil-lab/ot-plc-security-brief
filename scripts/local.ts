/**
 * One-command local run, no PostgreSQL or Docker install needed:
 *   npm run local
 *
 * - Starts a bundled PostgreSQL (embedded-postgres) with its data in ./.local/pgdata
 * - Creates .env on first run (random APP_SECRET, development email mode)
 * - Applies migrations, seeds the 17 sources, loads the DEMO stories on first run
 * - Creates an admin on first run and writes the sign-in to .local/ADMIN-LOGIN.txt
 * - Builds the app (first run, and again only when the code changes), then runs
 *   the production server on http://localhost:3000 plus the background worker
 *   Use `npm run local -- --dev` for development mode with hot reload instead.
 * Press Ctrl+C to stop everything cleanly. Data is kept between runs.
 */
// Load .env like the web app does (APP_SECRET, email settings, proxy, ...).
import "dotenv/config";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";

const ROOT = resolve(__dirname, "..");
const LOCAL = join(ROOT, ".local");
const DATA = join(LOCAL, "pgdata");
const PG_PORT = Number(process.env.LOCAL_PG_PORT ?? 54329);
const PREFERRED_PORT = Number(process.env.PORT ?? 3000);
let APP_PORT = PREFERRED_PORT;
const DB_URL = `postgresql://brief:brief@localhost:${PG_PORT}/brief`;
const isWin = process.platform === "win32";
const DEV_MODE = process.argv.includes("--dev");

/** Newest modification time among the files that affect the production build. */
function newestSourceMtime(): number {
  let newest = 0;
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else newest = Math.max(newest, st.mtimeMs);
    }
  };
  for (const d of ["src", "config"]) if (existsSync(join(ROOT, d))) walk(join(ROOT, d));
  for (const f of ["next.config.ts", "package.json", "package-lock.json", "postcss.config.mjs", "prisma/schema.prisma"]) {
    if (existsSync(join(ROOT, f))) newest = Math.max(newest, statSync(join(ROOT, f)).mtimeMs);
  }
  return newest;
}

/** Resolves true if nothing is listening on the port (IPv4 and IPv6 localhost). */
function portIsFree(port: number): Promise<boolean> {
  const tryHost = (host: string) =>
    new Promise<boolean>((resolve) => {
      const srv = createServer()
        .once("error", (e: NodeJS.ErrnoException) => resolve(e.code === "EADDRNOTAVAIL" || e.code === "EAFNOSUPPORT"))
        .once("listening", () => srv.close(() => resolve(true)))
        .listen(port, host);
    });
  return tryHost("127.0.0.1").then((v4) => (v4 ? tryHost("::1") : false));
}

/**
 * Make sure the app databases exist and use UTF-8. A database created with
 * another encoding (older Windows installs used WIN1252) is kept as a renamed
 * backup and a fresh UTF-8 database is created; feeds are re-fetched and the
 * admin is restored. Returns the names of databases that were (re)created.
 */
async function ensureUtf8Databases(pg: EmbeddedPostgres): Promise<Set<string>> {
  const created = new Set<string>();
  const client = pg.getPgClient("postgres");
  await client.connect();
  try {
    for (const db of ["brief", "brief_test"]) {
      const r = await client.query<{ enc: string }>("SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = $1", [db]);
      const enc = r.rows[0]?.enc;
      if (enc === "UTF8") continue;
      if (enc) {
        const stamp = new Date().toISOString().slice(0, 19).replace(/\D/g, "");
        const backup = `${db}_${enc.toLowerCase()}_backup_${stamp}`;
        await client.query(`ALTER DATABASE "${db}" RENAME TO "${backup}"`);
        log(`Database "${db}" used ${enc} encoding, which can't store some advisory text. Kept it as "${backup}" and created a new UTF-8 database; feeds will be fetched again.`);
      }
      await client.query(`CREATE DATABASE "${db}" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);
      created.add(db);
    }
  } finally {
    await client.end();
  }
  return created;
}

/**
 * Find web server / worker processes of THIS project left running by an earlier
 * session (e.g. a window that was closed before this fix). Only Node processes
 * whose command line points into this project's folder and runs the Next server
 * or the worker are returned.
 */
function findLeftoverAppProcesses(): number[] {
  const root = ROOT.toLowerCase().replace(/\\/g, "/");
  const isApp = (cmd: string) => {
    const c = cmd.toLowerCase().replace(/\\/g, "/");
    return c.includes(root) && /(next\/dist\/bin\/next"?\s+(start|dev)|scripts\/worker\.ts|scripts\/guard\.cjs|\.bin\/next"?\s+(start|dev)|next\/dist\/server\/lib\/start-server)/.test(c);
  };
  const procs: { pid: number; cmd: string }[] = [];
  if (isWin) {
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"],
      { encoding: "utf8", timeout: 20_000 },
    );
    try {
      const parsed = JSON.parse(r.stdout || "[]") as { ProcessId: number; CommandLine: string | null } | { ProcessId: number; CommandLine: string | null }[];
      for (const p of Array.isArray(parsed) ? parsed : [parsed]) if (p.CommandLine) procs.push({ pid: p.ProcessId, cmd: p.CommandLine });
    } catch {
      return [];
    }
  } else {
    const r = spawnSync("ps", ["-eo", "pid=,args="], { encoding: "utf8" });
    for (const line of (r.stdout ?? "").split("\n")) {
      const m = /^\s*(\d+)\s+(.*)$/.exec(line);
      if (!m) continue;
      let cmd = m[2];
      // Next renames its process to "next-server (vX)", hiding the command line
      // on Linux; identify it by its working folder instead.
      if (/^next-server\b/.test(cmd)) {
        try {
          if (realpathSync(`/proc/${m[1]}/cwd`) === realpathSync(ROOT)) cmd = `${ROOT}/node_modules/next/dist/bin/next start`;
        } catch {
          /* not ours or not readable */
        }
      }
      procs.push({ pid: Number(m[1]), cmd });
    }
  }
  return procs.filter((p) => p.pid !== process.pid && p.pid !== process.ppid && isApp(p.cmd)).map((p) => p.pid);
}

/** True only if `pid` is a running PostgreSQL server process (never touch anything else). */
function isPostgresProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  if (isWin) {
    const r = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { encoding: "utf8" });
    return /"postgres\.exe"/i.test(r.stdout ?? "");
  }
  try {
    return /postgres/.test(readFileSync(`/proc/${pid}/cmdline`, "utf8"));
  } catch {
    return process.platform === "darwin"; // no /proc; the PID came from this data dir's own lock file
  }
}

/** Stop a bundled database left running by a session that was killed without cleaning up. */
async function stopLeftoverPostgres() {
  const pidFile = join(DATA, "postmaster.pid");
  if (!existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, "utf8").split(/\r?\n/)[0]);
  if (!pid || !isPostgresProcess(pid)) return; // stale lock file: PostgreSQL clears it on start
  log("Stopping a database left running by a previous session...");
  if (isWin) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  else process.kill(pid, "SIGINT"); // fast, clean shutdown
  for (let i = 0; i < 30 && isPostgresProcess(pid); i++) await new Promise((r) => setTimeout(r, 500));
}

function buildIsCurrent(): boolean {
  const id = join(ROOT, ".next", "BUILD_ID");
  return existsSync(id) && statSync(id).mtimeMs >= newestSourceMtime();
}

const log = (msg: string) => console.log(`\x1b[36m[local]\x1b[0m ${msg}`);

/** Windows needs a shell to find npx.cmd; pass one command string there (avoids Node's DEP0190 warning). */
function spawnArgs(cmd: string, args: string[]): [string, string[]] {
  return isWin ? [[cmd, ...args].join(" "), []] : [cmd, args];
}

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv) {
  const r = spawnSync(...spawnArgs(cmd, args), { cwd: ROOT, env, stdio: "inherit", shell: isWin });
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
  const leftovers = findLeftoverAppProcesses();
  if (leftovers.length) {
    log(`Stopping ${leftovers.length} process(es) of this app left running by an earlier session...`);
    for (const pid of leftovers) {
      try {
        process.kill(pid);
      } catch {
        /* already gone */
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  for (let port = PREFERRED_PORT; port < PREFERRED_PORT + 20; port++) {
    if (await portIsFree(port)) {
      APP_PORT = port;
      break;
    }
  }
  if (APP_PORT !== PREFERRED_PORT) {
    log(`Port ${PREFERRED_PORT} is already in use (another copy of the app may still be running). Using port ${APP_PORT} instead.`);
  } else if (!(await portIsFree(APP_PORT))) {
    throw new Error(`Ports ${PREFERRED_PORT}-${PREFERRED_PORT + 19} are all in use. Close other servers and try again.`);
  }
  ensureEnvFile();

  const firstRun = !existsSync(join(DATA, "PG_VERSION"));
  // Always UTF-8 with the C locale. Without this, initdb on Windows follows the
  // system locale (e.g. WIN1252), and advisories containing characters outside
  // that code page fail to save.
  const pg = new EmbeddedPostgres({
    databaseDir: DATA,
    user: "brief",
    password: "brief",
    port: PG_PORT,
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });
  if (firstRun) {
    log("First run: initialising the bundled PostgreSQL (one time)...");
    await pg.initialise();
  }
  await stopLeftoverPostgres();
  await pg.start();
  log(`PostgreSQL running on port ${PG_PORT} (data in .local/pgdata).`);
  const recreated = await ensureUtf8Databases(pg);

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
    // Children are plain Node processes (no shell layers), so ending them directly
    // stops everything; any process they started exits via exit-with-parent.cjs.
    for (const c of children) {
      if (c.pid && c.exitCode === null) {
        try {
          if (isWin) process.kill(c.pid);
          else process.kill(-c.pid, "SIGTERM"); // its process group
        } catch {
          /* already gone */
        }
      }
    }
    await pg.stop().catch(() => {});
    log("Stopped. Your data is kept in .local/ for next time.");
    process.exit(code);
  };
  // SIGHUP/SIGBREAK: the console window was closed (Windows) or the terminal went away.
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"] as const) {
    try {
      process.on(sig, () => void stop());
    } catch {
      /* signal not supported on this platform */
    }
  }

  try {
    log("Preparing the database client...");
    run("npx", ["prisma", "generate"], env);
    log("Applying database migrations...");
    run("npx", ["prisma", "migrate", "deploy"], env);
    run("npx", ["tsx", "scripts/seed.ts"], env);

    const loginFile = join(LOCAL, "ADMIN-LOGIN.txt");
    if (recreated.has("brief") && existsSync(loginFile)) {
      // Database was rebuilt as UTF-8: restore the demo data and the same admin sign-in.
      run("npx", ["tsx", "scripts/seed-demo.ts"], env);
      const t = readFileSync(loginFile, "utf8");
      const email = /Email:\s+(\S+)/.exec(t)?.[1];
      const password = /Password:\s+(\S+)/.exec(t)?.[1];
      if (email && password) {
        spawnSync(...spawnArgs("npx", ["tsx", "scripts/admin-create.ts", "--if-missing"]), {
          cwd: ROOT,
          env: { ...env, ADMIN_EMAIL: email, ADMIN_PASSWORD: password },
          stdio: "ignore",
          shell: isWin,
        });
        log("Admin restored with the sign-in in .local/ADMIN-LOGIN.txt.");
      }
    } else if (firstRun || !existsSync(loginFile)) {
      run("npx", ["tsx", "scripts/seed-demo.ts"], env);
      const email = "admin@localhost.test";
      const password = randomBytes(12).toString("base64url");
      const res = spawnSync(...spawnArgs("npx", ["tsx", "scripts/admin-create.ts", "--if-missing"]), {
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
    if (!DEV_MODE && !buildIsCurrent()) {
      log("Building the app (first run or code changed; takes a minute or two)...");
      run("npx", ["next", "build"], { ...env, NODE_ENV: "production" });
    }
  } catch (e) {
    console.error(`\n[local] Setup failed: ${(e as Error).message}`);
    await stop(1);
    return;
  }

  log(`Starting the web app${DEV_MODE ? " in development mode" : ""} on http://localhost:${APP_PORT} and the background worker...`);
  // Web server and worker run as plain Node processes (no cmd/npx layers) with
  // scripts/exit-with-parent.cjs preloaded through NODE_OPTIONS, so they, and any
  // Node process they start, exit by themselves if this launcher disappears
  // (for example when its window is closed on Windows).
  const childEnv = (extra: Record<string, string> = {}) => ({
    ...env,
    ...extra,
    LOCAL_PARENT_PID: String(process.pid),
    NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --require ${JSON.stringify(join(ROOT, "scripts", "exit-with-parent.cjs"))}`.trim(),
  });
  const nextBin = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const node = (args: string[], extra?: Record<string, string>) =>
    spawn(process.execPath, args, { cwd: ROOT, env: childEnv(extra), stdio: "inherit", detached: !isWin });
  const web = DEV_MODE
    ? node([nextBin, "dev", "-p", String(APP_PORT)])
    : node([nextBin, "start", "-p", String(APP_PORT)], { NODE_ENV: "production" });
  const worker = node(["--import", "tsx", join(ROOT, "scripts", "worker.ts")]);
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
