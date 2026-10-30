/**
 * Process guard used by `npm run local`.
 *   node scripts/guard.cjs <parentPid> <command> [args...]
 *
 * Runs the command and ends its whole process tree when the launcher
 * (parentPid) is gone, e.g. after its console window was closed on Windows,
 * so no web server or worker is left running in the background.
 * Plain CommonJS so it starts without tsx.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain CommonJS so it runs without tsx
const { spawn, spawnSync } = require("node:child_process");

const [parentArg, ...cmd] = process.argv.slice(2);
const parentPid = Number(parentArg);
if (!parentPid || cmd.length === 0) {
  console.error("usage: node scripts/guard.cjs <parentPid> <command> [args...]");
  process.exit(2);
}

const isWin = process.platform === "win32";
const child = isWin
  ? spawn(cmd.join(" "), { stdio: "inherit", shell: true })
  : spawn(cmd[0], cmd.slice(1), { stdio: "inherit", detached: true });

let ending = false;
function endTree(code) {
  if (ending) return;
  ending = true;
  if (child.pid && child.exitCode === null) {
    if (isWin) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }
  process.exit(code);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

const watch = setInterval(() => {
  if (!isAlive(parentPid)) endTree(0);
}, 2000);

child.on("exit", (code) => {
  clearInterval(watch);
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  try {
    process.on(sig, () => endTree(0));
  } catch {
    /* signal not supported on this platform */
  }
}
