"use client";

import {
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
  ConnectButton,
} from "@mysten/dapp-kit";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SealCompatibleClient } from "@mysten/seal";
import { NETWORK, MIST_PER_SUI } from "@/lib/constants";
import { generateNonce, nonceToHex } from "@/lib/hash";
import { makeSealClient, sealEncrypt } from "@/lib/seal";
import { walrusStore } from "@/lib/walrus";
import { MevShieldCard } from "@/app/components/MevShieldCard";
import {
  UMBRA_PACKAGE_ID,
  UMBRA_POOL_ID,
  computeOrderHash,
  bytesToHex,
  buildSubmitOrderTx,
  buildRevealOrderTx,
  buildSettleTx,
  buildClaimFillTx,
  parseUmbraPool,
  type UmbraPool,
} from "@/lib/umbra";

const SUISCAN = `https://suiscan.xyz/${NETWORK}`;
const txUrl = (d: string) => `${SUISCAN}/tx/${d}`;
const objUrl = (id: string) => `${SUISCAN}/object/${id}`;
const ORDER_KEY = `umbra_order_${UMBRA_POOL_ID}`;

// ── LEFT PANEL DATA — anatomy of a real Cetus sandwich ────────────────────────
// Representative on-chain values from a documented Cetus sandwich. Drop a live tx
// digest into `txDigest` to make it explorer-verifiable for the demo.
const SANDWICH = {
  dex: "Cetus",
  pair: "USDC → SUI",
  victimIn: "5,000 USDC",
  fairOut: "5,000.00",
  actualOut: "4,957.83",
  mevExtracted: 42.17,
  pricePush: "+0.84%",
  txDigest: "" as string, // ← paste a real sandwich digest here to enable the verify link
};

type Phase = "LOADING" | "COMMIT" | "REVEAL" | "SETTLED" | "ENDED" | "NOT_CONFIGURED";
type SubmitStage = "idle" | "hashing" | "sealing" | "walrus" | "submitting" | "done" | "error";

function Spinner() {
  return <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEFT — "The Rekt": a public swap, sandwiched
// ─────────────────────────────────────────────────────────────────────────────
function RektPanel() {
  const steps = [
    { t: "Victim broadcasts swap", d: `${SANDWICH.victimIn} → SUI · visible in mempool`, tone: "text-zinc-300", dot: "bg-zinc-500" },
    { t: "Bot front-runs", d: `buys first, pushes price ${SANDWICH.pricePush}`, tone: "text-red-300", dot: "bg-red-500" },
    { t: "Victim fills — worse price", d: `expected ${SANDWICH.fairOut} · got ${SANDWICH.actualOut}`, tone: "text-amber-300", dot: "bg-amber-500" },
    { t: "Bot back-runs — banks the spread", d: `extracted from the victim`, tone: "text-red-400", dot: "bg-red-500" },
  ];
  return (
    <div className="rounded-2xl border border-red-500/25 bg-gradient-to-b from-red-950/20 to-zinc-950/40 p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-red-400/80">A public swap · {SANDWICH.dex}</p>
          <h3 className="text-lg font-bold text-zinc-100">The Rekt</h3>
        </div>
        <span className="text-2xl">🥪</span>
      </div>

      <div className="space-y-2.5">
        {steps.map((s, i) => (
          <motion.div
            key={s.t}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 * i, duration: 0.4 }}
            className="flex items-start gap-2.5"
          >
            <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
            <div>
              <p className={`text-sm font-semibold ${s.tone}`}>{s.t}</p>
              <p className="text-[11px] text-zinc-500 font-mono">{s.d}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.7, type: "spring", stiffness: 200, damping: 16 }}
        className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 flex items-baseline justify-between"
      >
        <span className="text-xs text-red-300/80 uppercase tracking-widest">MEV extracted</span>
        <span className="font-mono text-3xl font-bold text-red-400 tabular-nums">−${SANDWICH.mevExtracted.toFixed(2)}</span>
      </motion.div>

      <p className="text-[11px] text-zinc-600 leading-relaxed">
        The order was readable in the mempool the instant it broadcast. Front-running only
        needs to <span className="text-zinc-400">see</span> the trade.
        {SANDWICH.txDigest && (
          <>{" "}<a href={txUrl(SANDWICH.txDigest)} target="_blank" rel="noopener noreferrer" className="text-red-400 hover:underline">Verify on SuiScan ↗</a></>
        )}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
export function UmbraTerminal() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();

  const [pool, setPool] = useState<UmbraPool | null>(null);
  const [phase, setPhase] = useState<Phase>("LOADING");
  const [qty, setQty] = useState("10");
  const [price, setPrice] = useState("0.002"); // SUI per UMB unit
  const [stage, setStage] = useState<SubmitStage>("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [orderHash, setOrderHash] = useState<string | null>(null);
  const [lastDigest, setLastDigest] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [nftId, setNftId] = useState<string | null>(null);
  const [nftStats, setNftStats] = useState<{ trades: number; totalSaved: string; lastSaved: string } | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick((t) => t + 1);

  // ── Pool + phase ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!UMBRA_POOL_ID || !UMBRA_PACKAGE_ID) { setPhase("NOT_CONFIGURED"); return; }
    let stop = false;
    async function load() {
      try {
        const obj = await client.getObject({ id: UMBRA_POOL_ID, options: { showContent: true } });
        if (obj.data?.content?.dataType !== "moveObject") return;
        const f = (obj.data.content as { fields: Record<string, unknown> }).fields;
        const p = parseUmbraPool(f);
        if (stop) return;
        setPool(p);
        const now = Date.now();
        setPhase(p.settled ? "SETTLED" : now < p.commitEndMs ? "COMMIT" : now < p.revealEndMs ? "REVEAL" : "ENDED");
      } catch (e) { console.error(e); }
    }
    load();
    const id = setInterval(load, 10_000);
    return () => { stop = true; clearInterval(id); };
  }, [client, refreshTick]);

  // ── User's order + NFT (scoped to this pool) ────────────────────────────────
  const fetchUserObjects = useCallback(async () => {
    if (!account?.address || !UMBRA_PACKAGE_ID) return;
    const norm = (s: unknown) =>
      typeof s === "string" ? s.replace(/^0x/, "").toLowerCase().padStart(64, "0") : "";
    const wantPool = norm(UMBRA_POOL_ID);
    try {
      const all: Awaited<ReturnType<typeof client.getOwnedObjects>>["data"] = [];
      let cursor: string | null | undefined = null;
      do {
        const page = await client.getOwnedObjects({
          owner: account.address,
          filter: { Package: UMBRA_PACKAGE_ID },
          options: { showContent: true },
          cursor,
        });
        all.push(...page.data);
        cursor = page.hasNextPage ? page.nextCursor : null;
      } while (cursor);

      let foundOrder: string | null = null;
      let foundNft: string | null = null;
      let foundStats: { trades: number; totalSaved: string; lastSaved: string } | null = null;
      for (const o of all) {
        if (o.data?.content?.dataType !== "moveObject") continue;
        const c = o.data.content as { type: string; fields: Record<string, unknown> };
        if (c.type.includes("::umbra_swap::SealedOrder") && norm(c.fields.pool_id) === wantPool) foundOrder = o.data.objectId;
        if (c.type.includes("::umbra_swap::MevShieldNFT")) {
          foundNft = o.data.objectId;
          foundStats = {
            trades: Number(c.fields.trades ?? 0),
            totalSaved: String(c.fields.total_saved ?? "0"),
            lastSaved: String(c.fields.last_saved ?? "0"),
          };
        }
      }
      setOrderId(foundOrder);
      setNftId(foundNft);
      setNftStats(foundStats);
    } catch (e) { console.error(e); }
  }, [client, account?.address]);

  useEffect(() => { setOrderId(null); setNftId(null); setNftStats(null); fetchUserObjects(); }, [account?.address, refreshTick, fetchUserObjects]);

  const minPriceSui = pool ? Number(pool.minPrice) / Number(MIST_PER_SUI) : 0;
  const escrowSui = (parseFloat(price) || 0) * (parseFloat(qty) || 0);

  // ── Submit a blind order (the live hero moment) ─────────────────────────────
  async function handleSubmit() {
    if (!account || stage === "hashing" || stage === "sealing" || stage === "walrus" || stage === "submitting") return;
    const priceMist = BigInt(Math.floor((parseFloat(price) || 0) * 1e9));
    const qtyUnits = BigInt(Math.floor(parseFloat(qty) || 0));
    if (priceMist <= 0n || qtyUnits <= 0n) { setStatusMsg("Enter a price and quantity."); return; }
    const escrowMist = priceMist * qtyUnits;

    setStage("hashing"); setOrderHash(null); setLastDigest(null);
    setStatusMsg("Sealing your order…");
    const nonce = generateNonce();
    const hash = computeOrderHash(priceMist, qtyUnits, nonce);
    setOrderHash(bytesToHex(hash));

    const stored = { nonce: nonceToHex(nonce), price: priceMist.toString(), qty: qtyUnits.toString() };
    localStorage.setItem(ORDER_KEY, JSON.stringify(stored));

    // Seal-encrypt the nonce → Walrus (recovery backup); failure is non-fatal.
    let blobIdBytes: number[] | null = null;
    try {
      setStage("sealing");
      const sealClient = makeSealClient(client as SealCompatibleClient);
      const payload = new TextEncoder().encode(JSON.stringify(stored));
      const encrypted = await sealEncrypt(sealClient, payload, UMBRA_PACKAGE_ID, UMBRA_POOL_ID);
      setStage("walrus");
      const blobId = await walrusStore(encrypted);
      blobIdBytes = Array.from(new TextEncoder().encode(blobId));
    } catch (e) { console.warn("Umbra Seal/Walrus backup failed:", e); }

    setStage("submitting");
    setStatusMsg("Broadcasting — but there's nothing to see…");
    const tx = buildSubmitOrderTx(hash, escrowMist, blobIdBytes);
    signAndExecute({ transaction: tx }, {
      onSuccess: (data) => { setStage("done"); setLastDigest(data.digest); setStatusMsg("Order live on-chain. The mempool saw a 32-byte shadow."); refresh(); },
      onError: (e) => { setStage("error"); setStatusMsg(`Error: ${e.message}`); },
    });
  }

  function runTx(build: () => ReturnType<typeof buildSettleTx>, pending: string, ok: string) {
    setStatusMsg(pending);
    signAndExecute({ transaction: build() }, {
      onSuccess: (data) => { setLastDigest(data.digest); setStatusMsg(ok); refresh(); },
      onError: (e) => { setStatusMsg(`Error: ${e.message}`); },
    });
  }

  function handleReveal() {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw || !orderId) { setStatusMsg("No local order nonce to reveal."); return; }
    const { nonce, price: p, qty: q } = JSON.parse(raw) as { nonce: string; price: string; qty: string };
    const nb = Uint8Array.from(nonce.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    runTx(() => buildRevealOrderTx(orderId, BigInt(p), BigInt(q), nb), "Revealing order…", "Order revealed. Entered into the fair clear.");
  }

  const submitting = stage === "hashing" || stage === "sealing" || stage === "walrus" || stage === "submitting";

  // ── Shield panel ────────────────────────────────────────────────────────────
  function ShieldPanel() {
    return (
      <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-cyan-950/20 to-zinc-950/40 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400/80">A confidential swap · Umbra</p>
            <h3 className="text-lg font-bold text-zinc-100">The Shield</h3>
          </div>
          <span className="text-2xl">🛡️</span>
        </div>

        {phase === "NOT_CONFIGURED" ? (
          <p className="text-sm text-zinc-500">Set NEXT_PUBLIC_UMBRA_PACKAGE_ID / _POOL_ID in .env.local.</p>
        ) : !account ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-sm text-zinc-400">Connect to swap without leaking your order.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            {/* Order input */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Quantity (UMB)</label>
                <input value={qty} onChange={(e) => setQty(e.target.value)} type="number"
                  className="w-full mt-1 bg-white/[0.03] border border-white/10 focus:border-cyan-500/40 px-3 py-2 rounded-lg text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Max price (SUI/unit)</label>
                <input value={price} onChange={(e) => setPrice(e.target.value)} type="number"
                  className="w-full mt-1 bg-white/[0.03] border border-white/10 focus:border-cyan-500/40 px-3 py-2 rounded-lg text-sm outline-none" />
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono">
              Escrow {escrowSui.toFixed(4)} SUI · floor {minPriceSui} SUI/unit
            </p>

            {phase === "COMMIT" && !orderId && (
              <button onClick={handleSubmit} disabled={submitting}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${submitting ? "opacity-50 cursor-not-allowed bg-cyan-800" : "bg-cyan-600 hover:bg-cyan-500"}`}>
                {submitting ? "Sealing…" : "Submit Confidential Order →"}
              </button>
            )}

            {/* The hash — what the mempool sees */}
            <AnimatePresence>
              {orderHash && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-cyan-500/25 bg-black/40 px-4 py-3 space-y-2">
                  <p className="text-[10px] text-cyan-400/80 font-mono uppercase tracking-widest">What the mempool sees</p>
                  <p className="font-mono text-[11px] text-cyan-300 break-all leading-relaxed">{orderHash}</p>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-emerald-400 text-sm font-bold">$0 extractable</span>
                    <span className="text-zinc-600 text-xs">nothing to front-run · nothing to reorder</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Phase-aware controls */}
            {orderId && phase === "COMMIT" && (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-400">
                Order sealed & escrowed. Reveal opens when the commit window closes.
                <a href={objUrl(orderId)} target="_blank" rel="noopener noreferrer" className="block mt-1 text-cyan-400 hover:underline font-mono">Your SealedOrder ↗</a>
              </div>
            )}
            {orderId && phase === "REVEAL" && (
              <button onClick={handleReveal}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-amber-600 hover:bg-amber-500 transition-colors">
                Reveal Order →
              </button>
            )}
            {phase === "ENDED" && !pool?.settled && (
              <button onClick={() => runTx(buildSettleTx, "Settling via Sui DKG randomness…", "Settled. Fair clear at uniform price.")}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 transition-colors">
                Settle (sui::random 0x8) →
              </button>
            )}
            {phase === "SETTLED" && orderId && (
              <button onClick={() => runTx(() => buildClaimFillTx(orderId, nftId), "Claiming fill…", "Filled. MEV-Shield NFT minted.")}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 transition-colors">
                Claim Fill + MEV-Shield NFT →
              </button>
            )}
            {nftId && nftStats && (
              <MevShieldCard nftId={nftId} trades={nftStats.trades} totalSavedMist={nftStats.totalSaved} lastSavedMist={nftStats.lastSaved} />
            )}

            {statusMsg && (
              <div className={`text-[12px] rounded-lg px-3 py-2 ${stage === "error" || statusMsg.startsWith("Error") ? "bg-red-950/30 text-red-300" : stage === "done" ? "bg-emerald-950/30 text-emerald-300" : "bg-white/[0.03] text-zinc-300"}`}>
                {submitting && <Spinner />} {statusMsg}
              </div>
            )}
            {lastDigest && (
              <a href={txUrl(lastDigest)} target="_blank" rel="noopener noreferrer" className="block text-[11px] text-cyan-400 hover:underline font-mono">View tx on SuiScan ↗</a>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <p className="text-[11px] font-mono uppercase tracking-[0.25em] text-zinc-500">Same $5,000 swap · two outcomes</p>
        <h2 className="text-2xl sm:text-3xl font-bold text-zinc-100">
          They can&apos;t sandwich what they can&apos;t <span className="text-cyan-400">see</span>.
        </h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <RektPanel />
        <ShieldPanel />
      </div>
      {pool && (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] font-mono text-zinc-600">
          <span>phase: <span className="text-zinc-400">{phase}</span></span>
          <span>orders: <span className="text-zinc-400">{pool.orderCount}</span></span>
          <span>revealed: <span className="text-zinc-400">{pool.revealCount}</span></span>
          {pool.settled && <span>clearing: <span className="text-zinc-400">{Number(pool.clearingPrice) / 1e9} SUI</span></span>}
          <a href={objUrl(UMBRA_POOL_ID)} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">pool ↗</a>
        </div>
      )}
    </div>
  );
}
