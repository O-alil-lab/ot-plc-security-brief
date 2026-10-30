"use client";

import { useState } from "react";

type S = { id: string; headline: string; isDemo: boolean };

/** Choose and order published stories. Writes the order to a hidden "order" input. */
export function StoryPicker({ available, initial, disabled }: { available: S[]; initial: string[]; disabled?: boolean }) {
  const [order, setOrder] = useState<string[]>(initial.filter((id) => available.some((a) => a.id === id)));
  const byId = new Map(available.map((a) => [a.id, a]));
  const unused = available.filter((a) => !order.includes(a.id));

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  return (
    <div className="space-y-3 text-sm">
      <input type="hidden" name="order" value={order.join(",")} />
      {order.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-slate">No stories in this issue yet. Add published stories from the list below.</p>
      ) : (
        <ol className="space-y-2">
          {order.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-md border border-line p-2">
              <span className="w-6 text-right text-slate">{i + 1}.</span>
              <span className="flex-1">{byId.get(id)?.headline}{byId.get(id)?.isDemo && " (DEMO)"}</span>
              <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} className="btn btn-secondary px-2 py-1" aria-label={`Move ${byId.get(id)?.headline} up`}>Up</button>
              <button type="button" disabled={disabled || i === order.length - 1} onClick={() => move(i, 1)} className="btn btn-secondary px-2 py-1" aria-label={`Move ${byId.get(id)?.headline} down`}>Down</button>
              <button type="button" disabled={disabled} onClick={() => setOrder(order.filter((x) => x !== id))} className="btn btn-danger px-2 py-1">Remove</button>
            </li>
          ))}
        </ol>
      )}
      {!disabled && unused.length > 0 && (
        <details className="rounded-md border border-line p-3">
          <summary className="cursor-pointer font-medium">Add published stories ({unused.length} available)</summary>
          <ul className="mt-2 space-y-1">
            {unused.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <span>{s.headline}{s.isDemo && " (DEMO)"}</span>
                <button type="button" onClick={() => setOrder([...order, s.id])} className="btn btn-secondary px-2 py-1">Add</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
