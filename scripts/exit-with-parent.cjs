/**
 * Preloaded into the web server and worker by `npm run local` (via NODE_OPTIONS).
 * If the launcher process (LOCAL_PARENT_PID) disappears, e.g. because its
 * console window was closed, this process exits by itself. Nothing external
 * is spawned, so it also works while Windows is tearing down the console.
 */
const parentPid = Number(process.env.LOCAL_PARENT_PID);

function parentAlive() {
  try {
    process.kill(parentPid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

if (parentPid && parentPid !== process.pid) {
  const timer = setInterval(() => {
    if (!parentAlive()) process.exit(0);
  }, 2000);
  timer.unref(); // never keeps a process alive on its own
}
