// Plant a low FLOOR order (submit + reveal) on an Umbra pool from a dedicated
// dummy keypair, so a higher demo order clears ABOVE it and the MEV-Shield NFT
// shows a juicy number (saved = your_price - clearing_price). Run AFTER staging
// a demo pool, BEFORE the pitch. Blocks through the commit window, then reveals.
//
//   (from frontend/)  node scripts/umbra_floor.mjs <POOL_ID> [priceSui=0.001] [qty=5]
//
// The floor keypair is generated once and persisted (.umbra_floor_key, gitignored);
// fund it once via faucet and re-runs reuse it.

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PACKAGE_ID = process.env.NEXT_PUBLIC_UMBRA_PACKAGE_ID
  || "0xd3196fdf9cc6696ac7f5fcfa80252227b2504721860a7cf414150a6541b9ece0";
const CLOCK_ID = "0x6";
const KEY_FILE = join(dirname(fileURLToPath(import.meta.url)), ".umbra_floor_key");

const poolId = process.argv[2];
const priceSui = parseFloat(process.argv[3] || "0.001");
const qty = BigInt(process.argv[4] || "5");
if (!poolId) { console.error("Usage: node scripts/umbra_floor.mjs <POOL_ID> [priceSui] [qty]"); process.exit(1); }

const priceMist = BigInt(Math.floor(priceSui * 1e9));
const escrow = priceMist * qty;
const client = new SuiClient({ url: getFullnodeUrl("testnet") });

// ── floor keypair (persisted) ─────────────────────────────────────────────────
let kp;
if (existsSync(KEY_FILE)) {
  kp = Ed25519Keypair.fromSecretKey(readFileSync(KEY_FILE, "utf8").trim());
} else {
  kp = new Ed25519Keypair();
  writeFileSync(KEY_FILE, kp.getSecretKey());
  console.log("Generated floor key →", KEY_FILE);
}
const addr = kp.getPublicKey().toSuiAddress();
console.log("Floor address:", addr);

function orderHash(price, q, nonce) {
  const b = Buffer.alloc(16);
  b.writeBigUInt64LE(price, 0);   // matches std::bcs::to_bytes(&price)
  b.writeBigUInt64LE(q, 8);       // matches std::bcs::to_bytes(&qty)
  return new Uint8Array(createHash("sha3-256").update(Buffer.concat([b, Buffer.from(nonce)])).digest());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function balance() { return BigInt((await client.getBalance({ owner: addr })).totalBalance); }

async function ensureFunds(need) {
  let bal = await balance();
  if (bal >= need) { console.log("Floor balance:", bal.toString()); return; }
  // Best-effort faucet (V2). If unavailable / rate-limited, instruct manual funding.
  try {
    const { requestSuiFromFaucetV2, getFaucetHost } = await import("@mysten/sui/faucet");
    for (let i = 0; i < 3 && bal < need; i++) {
      console.log(`Requesting faucet (have ${bal})…`);
      try { await requestSuiFromFaucetV2({ host: getFaucetHost("testnet"), recipient: addr }); } catch (e) { console.warn("faucet:", e.message); }
      await sleep(5000); bal = await balance();
    }
  } catch { /* faucet module shape changed */ }
  if (bal < need) {
    console.error(`\nFloor underfunded (have ${bal}, need ${need}).`);
    console.error(`Fund it manually, then re-run:  sui client faucet --address ${addr}\n`);
    process.exit(1);
  }
  console.log("Floor balance:", bal.toString());
}

async function poolFields() {
  const o = await client.getObject({ id: poolId, options: { showContent: true } });
  if (o.data?.content?.dataType !== "moveObject") throw new Error("pool not found");
  return o.data.content.fields;
}

async function findFloorOrder() {
  const owned = await client.getOwnedObjects({ owner: addr, filter: { Package: PACKAGE_ID }, options: { showContent: true } });
  const norm = (s) => (typeof s === "string" ? s.replace(/^0x/, "").toLowerCase().padStart(64, "0") : "");
  const want = norm(poolId);
  return owned.data.find((o) => {
    const c = o.data?.content;
    return c?.dataType === "moveObject" && c.type.includes("::umbra_swap::SealedOrder") && norm(c.fields.pool_id) === want;
  })?.data?.objectId ?? null;
}

async function exec(tx) {
  tx.setSender(addr);
  const r = await client.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true } });
  await client.waitForTransaction({ digest: r.digest });
  return r;
}

const nonce = randomBytes(32);

(async () => {
  const f = await poolFields();
  const commitEnd = Number(f.commit_end_ms), revealEnd = Number(f.reveal_end_ms);
  await ensureFunds(escrow + 50_000_000n);

  // SUBMIT (skip if this floor already has an order on the pool)
  let orderId = await findFloorOrder();
  if (orderId) {
    console.log("Floor already has an order on this pool — skipping submit.");
  } else if (Date.now() < commitEnd) {
    const hash = orderHash(priceMist, qty, nonce);
    const tx = new Transaction();
    const [esc] = tx.splitCoins(tx.gas, [tx.pure.u64(escrow)]);
    tx.moveCall({ target: `${PACKAGE_ID}::umbra_swap::submit_order`, arguments: [
      tx.object(poolId), tx.pure.vector("u8", Array.from(hash)), esc, tx.pure.option("vector<u8>", null), tx.object(CLOCK_ID),
    ] });
    const r = await exec(tx);
    console.log("Floor submitted:", r.digest);
  } else {
    console.error("Commit window already closed — cannot plant a floor on this pool."); process.exit(1);
  }

  // WAIT for the reveal window
  const wait = commitEnd - Date.now() + 3000;
  if (wait > 0) { console.log(`Waiting ${Math.ceil(wait / 1000)}s for reveal window…`); await sleep(wait); }

  if (!orderId) orderId = await findFloorOrder();
  if (!orderId) { console.error("Floor SealedOrder not found after submit."); process.exit(1); }

  // REVEAL — an UNrevealed order does not enter settlement, so this is required.
  if (Date.now() < revealEnd) {
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::umbra_swap::reveal_order`, arguments: [
      tx.object(poolId), tx.object(orderId), tx.pure.u64(priceMist), tx.pure.u64(qty), tx.pure.vector("u8", Array.from(nonce)), tx.object(CLOCK_ID),
    ] });
    const r = await exec(tx);
    console.log(`Floor revealed: ${r.digest}  (price ${priceSui} SUI/unit, qty ${qty})`);
    console.log("Done — any demo order above this price will show a non-zero MEV-Shield.");
  } else {
    console.error("Reveal window closed before the floor could reveal. Stage a longer pool."); process.exit(1);
  }
})().catch((e) => { console.error("floor planter failed:", e); process.exit(1); });
