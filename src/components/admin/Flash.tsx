/** Shows ?msg= or ?error= after an admin action. Text is rendered as text. */
export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (!msg && !error) return null;
  return error ? (
    <p role="alert" className="mb-5 rounded-md border border-danger/30 bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>
  ) : (
    <p role="status" className="mb-5 rounded-md border border-teal/30 bg-teal/5 px-4 py-3 text-sm text-ink">{msg}</p>
  );
}

export type FlashParams = Promise<{ msg?: string; error?: string } & Record<string, string | string[] | undefined>>;
