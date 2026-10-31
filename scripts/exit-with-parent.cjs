/**
 * Preloaded into the web server and worker by `npm run local` (via NODE_OPTIONS).
 * If the launcher disappears (e.g. its console window was closed on Windows),
 * this process exits by itself. Two independent signals, nothing external spawned:
 *  1. the IPC channel to the launcher closes ("disconnect"), which the OS
 *     reports as soon as the launcher process is gone;
 *  2. a poll of the launcher's PID every 2 s (covers processes started by these
 *     children, which inherit NODE_OPTIONS but have no IPC channel).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS preload
const fs = require("node:fs");

const parentPid = Number(process.env.LOCAL_PARENT_PID);
const logFile = process.env.LOCAL_SHUTDOWN_LOG;

function note(msg) {
  if (!logFile) return;
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} pid ${process.pid}: ${msg}\n`);
  } catch {
    /* logging is best effort */
  }
}

function parentAlive() {
  try {
    process.kill(parentPid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

if (parentPid && parentPid !== process.pid) {
  if (process.channel) {
    process.on("disconnect", () => {
      note("launcher link closed; exiting");
      process.exit(0);
    });
    process.channel.unref(); // the link never keeps a process alive on its own
  }
  const timer = setInterval(() => {
    if (!parentAlive()) {
      note(`launcher ${parentPid} is gone; exiting`);
      process.exit(0);
    }
  }, 2000);
  timer.unref(); // never keeps a process alive on its own
}
