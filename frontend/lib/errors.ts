// Shared tx/RPC error helpers — used by both LiveAuction (FairDrop) and Umbra.

export type ErrKind = "rejected" | "insufficient" | "network" | "phase" | "unknown";

// Turn a raw SDK/RPC/wallet error into a user-facing kind + message.
export function classifyError(err: unknown): { kind: ErrKind; msg: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  if (/reject|denied|cancel|refus|disapprov|user abort/.test(m)) return { kind: "rejected", msg: "Transaction cancelled in your wallet." };
  if (/insufficient|no valid gas|gas coin|budget|balance too low|no sui/.test(m)) return { kind: "insufficient", msg: "Not enough SUI to cover this transaction." };
  if (/timeout|timed out|network|failed to fetch|econn|socket|503|502|504|429|rate limit|deadline/.test(m)) return { kind: "network", msg: "Network hiccup talking to the RPC. Try again." };
  if (/ephaseended|etooearly|phase/.test(m)) return { kind: "phase", msg: "Wrong phase for this action — the window moved." };
  return { kind: "unknown", msg: raw.length > 140 ? raw.slice(0, 140) + "…" : raw };
}

// Retry a read (getObject / getOwnedObjects) with linear backoff to ride out RPC blips.
export async function withRetry<T>(fn: () => Promise<T>, tries = 3, delayMs = 700): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1))); }
  }
  throw last;
}
