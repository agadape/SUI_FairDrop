import { Transaction } from "@mysten/sui/transactions";
import type { ClientWithCoreApi } from "@mysten/sui/client";
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

// Build the umbra_policy::seal_approve dry-run tx the Seal key servers run to
// gate decryption of an order nonce. Bound to this pool + the caller's order.
export async function buildUmbraSealApproveTx(
  orderId: string,
  suiClient: ClientWithCoreApi,
  senderAddress: string,
): Promise<Uint8Array> {
  if (!UMBRA_PACKAGE_ID || !UMBRA_POOL_ID) throw new Error("Umbra package/pool not configured.");
  const poolHex = UMBRA_POOL_ID.replace(/^0x/, "").padStart(64, "0");
  const poolIdBytes = Array.from(
    Uint8Array.from({ length: 32 }, (_, i) => parseInt(poolHex.slice(i * 2, i * 2 + 2), 16)),
  );
  const tx = new Transaction();
  tx.setSender(senderAddress);
  tx.moveCall({
    target: `${UMBRA_PACKAGE_ID}::umbra_policy::seal_approve`,
    arguments: [tx.pure.vector("u8", poolIdBytes), tx.object(orderId), tx.object(UMBRA_POOL_ID), tx.object(CLOCK_ID)],
  });
  return await tx.build({ client: suiClient });
}

// Move Option<vector<u8>> arrives in several RPC/SDK shapes (flat bytes, {vec},
// {fields:{vec}}, base64 string, or empty = None) — same decoder as the auction.
export function decodeBlobId(raw: unknown): string | null {
  if (raw == null) return null;
  let v: unknown = raw;
  if (!Array.isArray(v) && typeof v === "object") {
    const o = v as { vec?: unknown; fields?: { vec?: unknown } };
    v = o.vec ?? o.fields?.vec ?? v;
  }
  if (!Array.isArray(v) || v.length === 0) return null;
  const b: unknown = Array.isArray(v[0]) ? v[0] : (typeof v[0] === "string" ? v[0] : v);
  try {
    if (typeof b === "string") return new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
    if (Array.isArray(b)) return new TextDecoder().decode(Uint8Array.from(b as number[]));
  } catch { return null; }
  return null;
}

// ── Error helpers (shared with FairDrop) ─────────────────────────────────────────
export { classifyError, withRetry, type ErrKind } from "./errors";

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
