const AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";
const PUBLISHER  = "https://publisher.walrus-testnet.walrus.space";

// Store a blob on Walrus testnet. Returns the blob_id string.
export async function walrusStore(data: Uint8Array, epochs = 5): Promise<string> {
  const res = await fetch(
    `${PUBLISHER}/v1/blobs?epochs=${epochs}`,
    { method: "PUT", body: data.buffer as ArrayBuffer },
  );
  if (!res.ok) throw new Error(`Walrus store failed: ${res.status}`);
  const json = await res.json() as { newlyCreated?: { blobObject: { blobId: string } }; alreadyCertified?: { blobId: string } };
  const blobId = json.newlyCreated?.blobObject.blobId ?? json.alreadyCertified?.blobId;
  if (!blobId) throw new Error("Walrus: no blobId in response");
  return blobId;
}

// Fetch a blob from Walrus testnet by blob_id.
export async function walrusRead(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Walrus read failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}
