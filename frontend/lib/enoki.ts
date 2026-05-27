import { EnokiClient } from "@mysten/enoki";
import { Transaction } from "@mysten/sui/transactions";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { NETWORK } from "./constants";

const ENOKI_API_KEY = process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? "";
let _client: EnokiClient | null = null;

// Thrown only when the user explicitly dismissed the signing popup.
// Infrastructure failures return null instead.
export class UserCancelledError extends Error {
  constructor() {
    super("Transaction cancelled by user.");
    this.name = "UserCancelledError";
  }
}

function isUserRejection(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("reject") ||
    msg.includes("denied") ||
    msg.includes("cancel") ||
    msg.includes("refused") ||
    msg.includes("disapproved")
  );
}

export function getEnokiClient(): EnokiClient | null {
  if (!ENOKI_API_KEY) return null;
  if (!_client) _client = new EnokiClient({ apiKey: ENOKI_API_KEY });
  return _client;
}

// Returns { digest } on success.
// Returns null on any infrastructure failure — caller falls back to self-sign.
// Throws UserCancelledError only when user explicitly rejected the signing popup.
export async function trySponsorTransaction(
  tx: Transaction,
  senderAddress: string,
  suiClient: ClientWithCoreApi,
  signTransaction: (args: { transaction: Transaction }) => Promise<{ bytes: string; signature: string }>,
): Promise<{ digest: string } | null> {
  const enoki = getEnokiClient();
  if (!enoki) return null;

  let stage = "build";
  try {
    const kindBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
    const kindB64 = btoa(String.fromCharCode(...kindBytes));

    stage = "create";
    const { bytes: sponsoredB64, digest } = await enoki.createSponsoredTransaction({
      network: NETWORK,
      transactionKindBytes: kindB64,
      sender: senderAddress,
    });

    stage = "decode";
    const sponsoredBytes = Uint8Array.from(atob(sponsoredB64), (c) => c.charCodeAt(0));
    const sponsoredTx = Transaction.from(sponsoredBytes);

    stage = "sign";
    const { signature } = await signTransaction({ transaction: sponsoredTx });

    stage = "execute";
    await enoki.executeSponsoredTransaction({ digest, signature });

    return { digest };
  } catch (err) {
    if (stage === "sign" && isUserRejection(err)) throw new UserCancelledError();
    console.warn(`[Enoki] stage=${stage} failed:`, err);
    return null;
  }
}
