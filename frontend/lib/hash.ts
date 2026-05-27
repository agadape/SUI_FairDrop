import { sha3_256 } from "@noble/hashes/sha3.js";

// Compute sha3_256(amount_le_bytes || nonce_bytes) — mirrors Move contract's reveal_bid check
export function computeCommitmentHash(
  amountMist: bigint,
  nonce: Uint8Array,
): Uint8Array {
  const amountBytes = new Uint8Array(8);
  const view = new DataView(amountBytes.buffer);
  view.setBigUint64(0, amountMist, true); // little-endian, matches BCS u64 encoding

  const preimage = new Uint8Array(amountBytes.length + nonce.length);
  preimage.set(amountBytes, 0);
  preimage.set(nonce, amountBytes.length);

  return sha3_256(preimage);
}

export function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);
  return nonce;
}

export function nonceToHex(nonce: Uint8Array): string {
  return Array.from(nonce)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToNonce(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
