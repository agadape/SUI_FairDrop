import { Transaction } from "@mysten/sui/transactions";
import { sha3_256 } from "@noble/hashes/sha3.js";
import { CLOCK_ID, RANDOM_ID } from "./constants";

// ── Deployed Umbra (confidential MEV-proof swap) ──────────────────────────────
export const UMBRA_PACKAGE_ID = process.env.NEXT_PUBLIC_UMBRA_PACKAGE_ID ?? "";
export const UMBRA_POOL_ID = process.env.NEXT_PUBLIC_UMBRA_POOL_ID ?? "";

// Default art for the evolving MEV-Shield receipt.
export const SHIELD_IMG = "https://fairdrop.app/umbra-shield.png";

// commitment_hash = sha3_256(price_le8 ‖ qty_le8 ‖ nonce) — mirrors umbra_swap::reveal_order
export function computeOrderHash(priceMist: bigint, qty: bigint, nonce: Uint8Array): Uint8Array {
  const buf = new Uint8Array(16 + nonce.length);
  const view = new DataView(buf.buffer);
  view.setBigUint64(0, priceMist, true); // u64 LE — matches std::bcs::to_bytes(&price)
  view.setBigUint64(8, qty, true);        // u64 LE — matches std::bcs::to_bytes(&qty)
  buf.set(nonce, 16);
  return sha3_256(buf);
}

export function bytesToHex(b: Uint8Array): string {
  return "0x" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ── Tx builders ───────────────────────────────────────────────────────────────

// Submit a blind order. Escrow is split from the gas coin (self-pay path) to dodge
// the single-funded-coin gas-selection collision — same fix as the auction commit.
export function buildSubmitOrderTx(
  hash: Uint8Array,
  escrowMist: bigint,
  blobIdBytes: number[] | null,
): Transaction {
  const tx = new Transaction();
  const [escrow] = tx.splitCoins(tx.gas, [tx.pure.u64(escrowMist)]);
  tx.moveCall({
    target: `${UMBRA_PACKAGE_ID}::umbra_swap::submit_order`,
    arguments: [
      tx.object(UMBRA_POOL_ID),
      tx.pure.vector("u8", Array.from(hash)),
      escrow,
      tx.pure.option("vector<u8>", blobIdBytes ?? undefined),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

export function buildRevealOrderTx(
  orderId: string,
  priceMist: bigint,
  qty: bigint,
  nonce: Uint8Array,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${UMBRA_PACKAGE_ID}::umbra_swap::reveal_order`,
    arguments: [
      tx.object(UMBRA_POOL_ID),
      tx.object(orderId),
      tx.pure.u64(priceMist),
      tx.pure.u64(qty),
      tx.pure.vector("u8", Array.from(nonce)),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

export function buildReclaimUnsettledTx(orderId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${UMBRA_PACKAGE_ID}::umbra_swap::reclaim_unsettled`,
    arguments: [tx.object(UMBRA_POOL_ID), tx.object(orderId), tx.object(CLOCK_ID)],
  });
  return tx;
}

export function buildSettleTx(): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${UMBRA_PACKAGE_ID}::umbra_swap::settle`,
    arguments: [tx.object(UMBRA_POOL_ID), tx.object(RANDOM_ID), tx.object(CLOCK_ID)],
  });
  return tx;
}

// claim_fill takes `Option<MevShieldNFT>`. The SDK can't pass an object-option
// directly, so build it in-PTB via 0x1::option::some / none, then feed the result.
export function buildClaimFillTx(orderId: string, nftId: string | null): Transaction {
  const tx = new Transaction();
  const nftType = `${UMBRA_PACKAGE_ID}::umbra_swap::MevShieldNFT`;
  const maybeNft = nftId
    ? tx.moveCall({ target: "0x1::option::some", typeArguments: [nftType], arguments: [tx.object(nftId)] })
    : tx.moveCall({ target: "0x1::option::none", typeArguments: [nftType], arguments: [] });
  tx.moveCall({
    target: `${UMBRA_PACKAGE_ID}::umbra_swap::claim_fill`,
    arguments: [
      tx.object(UMBRA_POOL_ID),
      tx.object(orderId),
      maybeNft,
      tx.pure.vector("u8", Array.from(new TextEncoder().encode(SHIELD_IMG))),
    ],
  });
  return tx;
}

// ── Error classification + read retry ───────────────────────────────────────────
export type ErrKind = "rejected" | "insufficient" | "network" | "phase" | "unknown";

// Turn a raw SDK/RPC/wallet error into a user-facing kind + message.
export function classifyError(err: unknown): { kind: ErrKind; msg: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const m = raw.toLowerCase();
  if (/reject|denied|cancel|refus|disapprov|user abort/.test(m)) return { kind: "rejected", msg: "Transaction cancelled in your wallet." };
  if (/insufficient|no valid gas|gas coin|budget|balance too low/.test(m)) return { kind: "insufficient", msg: "Not enough SUI to cover escrow + gas." };
  if (/timeout|timed out|network|failed to fetch|econn|socket|503|502|504|429|rate limit|deadline/.test(m)) return { kind: "network", msg: "Network hiccup talking to the RPC. Try again." };
  if (/ephaseended|etooearly|abort.*(, 1\)|, 2\))/.test(m)) return { kind: "phase", msg: "Wrong phase for this action — the window moved." };
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

// ── On-chain pool read ─────────────────────────────────────────────────────────
export type UmbraPool = {
  supplyUnits: string;
  minPrice: string;
  commitEndMs: number;
  revealEndMs: number;
  settled: boolean;
  clearingPrice: string;
  orderCount: number; // committed
  revealCount: number;
};

export function parseUmbraPool(fields: Record<string, unknown>): UmbraPool {
  const commitments = fields.commitments as { fields?: { size?: string } } | null;
  const reveals = fields.reveals as { fields?: { contents?: unknown[] } } | null;
  return {
    supplyUnits: String(fields.supply_units),
    minPrice: String(fields.min_price),
    commitEndMs: Number(fields.commit_end_ms),
    revealEndMs: Number(fields.reveal_end_ms),
    settled: Boolean(fields.settled),
    clearingPrice: String(fields.clearing_price),
    orderCount: Number(commitments?.fields?.size ?? 0),
    revealCount: reveals?.fields?.contents?.length ?? 0,
  };
}
