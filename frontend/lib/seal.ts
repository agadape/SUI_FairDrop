import { SealClient, SessionKey } from "@mysten/seal";
import type { SealCompatibleClient } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { PACKAGE_ID, AUCTION_ID, CLOCK_ID } from "./constants";

// Re-export SessionKey so page.tsx only imports from here
export { SessionKey };

// Mysten Labs-managed Seal testnet key servers (from ts-sdks integration tests)
const TESTNET_KEY_SERVERS = [
  { objectId: "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", weight: 1 },
  { objectId: "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8", weight: 1 },
];

export function makeSealClient(suiClient: SealCompatibleClient): SealClient {
  return new SealClient({
    suiClient,
    serverConfigs: TESTNET_KEY_SERVERS,
    verifyKeyServers: false,
  });
}

// Encrypt data under the auction policy.
// id = auction object ID hex without 0x prefix.
// threshold = 1: only one of the two key servers needs to respond.
export async function sealEncrypt(
  sealClient: SealClient,
  data: Uint8Array,
  packageId: string,
  auctionId: string,
): Promise<Uint8Array> {
  const id = auctionId.replace(/^0x/, "");
  const { encryptedObject } = await sealClient.encrypt({
    // threshold = 2: BOTH key servers must cooperate to release the decryption
    // key. No single custodian can unilaterally read the nonce. (Was 1 — that
    // let either server decrypt alone, contradicting the "no server can read it"
    // trust claim.)
    threshold: 2,
    packageId,
    id,
    data,
  });
  return encryptedObject;
}

// Build a transaction that calls seal_policy::seal_approve.
// The Seal key server executes this to verify access policy before releasing decryption key.
export async function buildSealApproveTx(
  entryId: string,
  suiClient: ClientWithCoreApi,
  senderAddress: string,
): Promise<Uint8Array> {
  if (!PACKAGE_ID || !AUCTION_ID) throw new Error("PACKAGE_ID/AUCTION_ID not set");

  // auction_id_bytes = 32-byte raw ID (matches object::id_to_bytes in Move)
  const auctionHex = AUCTION_ID.replace(/^0x/, "").padStart(64, "0");
  const auctionIdBytes = Array.from(
    Uint8Array.from({ length: 32 }, (_, i) =>
      parseInt(auctionHex.slice(i * 2, i * 2 + 2), 16),
    ),
  );

  const tx = new Transaction();
  tx.setSender(senderAddress);
  tx.moveCall({
    target: `${PACKAGE_ID}::seal_policy::seal_approve`,
    arguments: [
      tx.pure.vector("u8", auctionIdBytes),
      tx.object(entryId),
      tx.object(AUCTION_ID),
      tx.object(CLOCK_ID),
    ],
  });
  // Seal key servers BCS-decode txBytes as a TransactionKind (SessionKey does
  // txBytes.slice(1) → ProgrammableTransaction). A full TransactionData build
  // fails to decode → "Invalid PTB: Invalid BCS" + 403. Build kind-only.
  return await tx.build({ client: suiClient, onlyTransactionKind: true });
}

// Decrypt ciphertext using a fully-configured SessionKey and the approve tx bytes.
export async function sealDecrypt(
  sealClient: SealClient,
  ciphertext: Uint8Array,
  sessionKey: SessionKey,
  txBytes: Uint8Array,
): Promise<Uint8Array> {
  return sealClient.decrypt({ data: ciphertext, sessionKey, txBytes });
}
