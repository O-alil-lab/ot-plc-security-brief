import { hash, verify } from "@node-rs/argon2";

// argon2id with OWASP-recommended baseline parameters.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("Password must be at least 12 characters");
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// A real argon2 hash used to keep login timing similar when the email is unknown.
let dummyHash: string | null = null;
export async function dummyVerify(password: string) {
  dummyHash ??= await hash("not-a-real-password-placeholder", OPTIONS);
  await verifyPassword(dummyHash, password);
}
