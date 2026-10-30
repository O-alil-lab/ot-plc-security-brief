import { getSession } from "@/lib/auth/session";

/** Hidden CSRF token for admin forms. Server component. */
export async function Csrf() {
  const s = await getSession();
  return <input type="hidden" name="csrf" value={s?.csrf ?? ""} />;
}
