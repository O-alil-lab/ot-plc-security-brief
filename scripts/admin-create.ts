/**
 * Create (or reset the password of) the single admin account.
 *   npm run admin:create
 * Prompts interactively, or reads ADMIN_EMAIL / ADMIN_PASSWORD once from the
 * environment. Nothing is printed except the email.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { emailSchema } from "../src/lib/subscribers/service";

async function promptHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, enc, cb) {
      if (!muted) stdout.write(chunk, enc as BufferEncoding);
      cb();
    },
  });
  const rl = createInterface({ input: stdin, output: out, terminal: true });
  stdout.write(question);
  muted = true;
  const answer = await rl.question("");
  rl.close();
  stdout.write("\n");
  return answer;
}

async function main() {
  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    if (!stdin.isTTY) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD, or run in an interactive terminal.");
    const rl = createInterface({ input: stdin, output: stdout });
    email = (await rl.question("Admin email: ")).trim();
    rl.close();
    password = await promptHidden("Password (min 12 chars): ");
    const again = await promptHidden("Repeat password: ");
    if (password !== again) throw new Error("Passwords do not match");
  }
  const normalized = emailSchema.parse(email);
  const passwordHash = await hashPassword(password);

  const existing = await prisma.admin.findFirst();
  if (existing && existing.email !== normalized) {
    throw new Error(`An admin already exists (${existing.email}). This MVP supports a single admin; re-run with that email to reset its password.`);
  }
  await prisma.admin.upsert({ where: { email: normalized }, create: { email: normalized, passwordHash }, update: { passwordHash } });
  // Invalidate any existing sessions after a password (re)set.
  await prisma.session.deleteMany({});
  console.log(`Admin ready: ${normalized}. Sign in at /admin/login`);
}

main()
  .catch((e) => {
    console.error(`admin:create failed: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
