"use client";

import {
  useCurrentAccount,
  useSuiClient,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
  ConnectButton,
} from "@mysten/dapp-kit";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SealCompatibleClient } from "@mysten/seal";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { NETWORK, MIST_PER_SUI } from "@/lib/constants";
import { generateNonce, nonceToHex } from "@/lib/hash";
import { makeSealClient, sealEncrypt, sealDecrypt, SessionKey } from "@/lib/seal";
import { walrusStore, walrusRead } from "@/lib/walrus";
import { MevShieldCard } from "@/app/components/MevShieldCard";
import { useToast } from "@/app/components/Toast";
import {
  UMBRA_PACKAGE_ID,
  UMBRA_POOL_ID,
  computeOrderHash,
  bytesToHex,
  buildSubmitOrderTx,
  buildRevealOrderTx,
  buildSettleTx,
  buildClaimFillTx,
  buildReclaimUnsettledTx,
  buildUmbraSealApproveTx,
  decodeBlobId,
  classifyError,
  withRetry,
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

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} aria-hidden />;
}

// Minimal inline icons — one stroke language, themeable (no emoji as structural icons).
function Icon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const IShield = (p: { className?: string }) => <Icon className={p.className} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
const IAlert = (p: { className?: string }) => <Icon className={p.className} d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />;
const ILock = (p: { className?: string }) => <Icon className={p.className} d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />;
const IArrow = (p: { className?: string }) => <Icon className={p.className} d="M5 12h14m-6-6 6 6-6 6" />;
const ICheck = (p: { className?: string }) => <Icon className={p.className} d="M20 6 9 17l-5-5" />;
const IExternal = (p: { className?: string }) => <Icon className={p.className} d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />;

// Recovery rail — Walrus → Seal → Restored. Mirrors the FairDrop auction beat.
type RecoveryStage = "idle" | "wiped" | "session" | "walrus" | "seal" | "restored" | "error";
type NodeState = "idle" | "active" | "done";
type StoredOrder = { nonce: string; price: string; qty: string };

function RailNode({ label, color, state }: { label: string; color: string; state: NodeState }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-5 h-5 flex items-center justify-center rounded-full border text-[10px] ${state === "idle" ? "border-white/10 text-zinc-600" : `border-current/30 ${color}`}`}>
        {state === "done" ? <ICheck className="w-3 h-3" /> : state === "active" ? <Spinner className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-40" />}
      </span>
      <span className={`text-[11px] font-mono tracking-wide ${state === "idle" ? "text-zinc-600" : color}`}>{label}</span>
    </div>
  );
}

function RecoveryRail({ stage }: { stage: RecoveryStage }) {
  const idx = ["session", "walrus", "seal", "restored"].indexOf(stage);
  const walrus: NodeState = idx >= 2 ? "done" : idx >= 0 ? "active" : "idle";
  const seal: NodeState = idx >= 3 ? "done" : idx === 2 ? "active" : "idle";
  const restored: NodeState = idx >= 3 ? "done" : "idle";
  return (
    <div className="flex items-center gap-2.5">
      <RailNode label="Walrus" color="text-cyan-400" state={walrus} />
      <span className="h-px w-4 bg-white/10" />
      <RailNode label="Seal" color="text-fuchsia-400" state={seal} />
      <span className="h-px w-4 bg-white/10" />
      <RailNode label="Restored" color="text-emerald-400" state={restored} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEFT — "The Rekt": a public swap, sandwiched
// ─────────────────────────────────────────────────────────────────────────────
function RektPanel() {
  const log = [
    { t: "broadcast", d: `swap ${SANDWICH.victimIn} → SUI · enters mempool`, c: "text-zinc-400" },
    { t: "frontrun", d: `bot buys ahead · price ${SANDWICH.pricePush}`, c: "text-rose-300" },
    { t: "fill", d: `expected ${SANDWICH.fairOut} · got ${SANDWICH.actualOut}`, c: "text-amber-300" },
    { t: "backrun", d: `bot dumps · banks the spread`, c: "text-rose-400" },
  ];
  return (
    <div className="rounded-2xl border border-rose-500/20 bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-rose-950/10">
        <div className="flex items-center gap-2">
          <IAlert className="w-4 h-4 text-rose-400" />
          <span className="text-sm font-semibold text-zinc-100">The Rekt</span>
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-rose-400/60">public · {SANDWICH.dex}</span>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-mono text-rose-400/80">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />mempool
        </span>
      </div>

      <div className="p-4 sm:p-5 font-mono text-[12px] leading-relaxed space-y-1.5">
        {log.map((l, i) => (
          <motion.div key={l.t} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 * i, duration: 0.35 }} className="flex gap-2.5">
            <span className="text-rose-500/40 select-none tabular-nums">{String(i + 1).padStart(2, "0")}</span>
            <span className="text-zinc-600 select-none w-16 flex-shrink-0">{l.t}</span>
            <span className={l.c}>{l.d}</span>
          </motion.div>
        ))}
        <div className="flex gap-2.5 pt-0.5">
          <span className="text-rose-500/40 select-none">{">"}</span>
          <span className="inline-block w-2 h-4 bg-rose-400/70 animate-pulse" />
        </div>
      </div>

      <div className="px-4 sm:px-5 pb-5">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6, type: "spring", stiffness: 200, damping: 18 }}
          className="flex items-baseline justify-between rounded-xl border border-rose-500/25 bg-rose-950/20 px-4 py-3">
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-rose-300/70">MEV extracted</span>
          <span className="font-mono text-3xl font-bold text-rose-400 tabular-nums">−${SANDWICH.mevExtracted.toFixed(2)}</span>
        </motion.div>
        <p className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
          Readable in the mempool the instant it broadcast. Front-running only needs to <span className="text-zinc-300">see</span> the trade.
          {SANDWICH.txDigest && (<>{" "}<a href={txUrl(SANDWICH.txDigest)} target="_blank" rel="noopener noreferrer" className="text-rose-400 hover:underline">verify ↗</a></>)}
        </p>
      </div>
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
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const toast = useToast();

  const [pool, setPool] = useState<UmbraPool | null>(null);
  const [phase, setPhase] = useState<Phase>("LOADING");
  const [loadError, setLoadError] = useState(false);
  const [orderBlobId, setOrderBlobId] = useState<string | null>(null);
  const [recoveryStage, setRecoveryStage] = useState<RecoveryStage>("idle");
  const sessionKeyRef = useRef<SessionKey | null>(null);
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
        const obj = await withRetry(() => client.getObject({ id: UMBRA_POOL_ID, options: { showContent: true } }));
        if (obj.data?.content?.dataType !== "moveObject") { if (!stop) setLoadError(true); return; }
        const f = (obj.data.content as { fields: Record<string, unknown> }).fields;
        const p = parseUmbraPool(f);
        if (stop) return;
        setLoadError(false);
        setPool(p);
        const now = Date.now();
        setPhase(p.settled ? "SETTLED" : now < p.commitEndMs ? "COMMIT" : now < p.revealEndMs ? "REVEAL" : "ENDED");
      } catch (e) {
        console.error(e);
        if (!stop) setLoadError(true); // the 10s interval keeps retrying
      }
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
      let foundBlob: string | null = null;
      let foundNft: string | null = null;
      let foundStats: { trades: number; totalSaved: string; lastSaved: string } | null = null;
      for (const o of all) {
        if (o.data?.content?.dataType !== "moveObject") continue;
        const c = o.data.content as { type: string; fields: Record<string, unknown> };
        if (c.type.includes("::umbra_swap::SealedOrder") && norm(c.fields.pool_id) === wantPool) {
          foundOrder = o.data.objectId;
          const b = decodeBlobId(c.fields.blob_id);
          if (b) foundBlob = b;
        }
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
      setOrderBlobId(foundBlob);
      setNftId(foundNft);
      setNftStats(foundStats);
    } catch (e) { console.error(e); }
  }, [client, account?.address]);

  useEffect(() => {
    setOrderId(null); setOrderBlobId(null); setNftId(null); setNftStats(null);
    setRecoveryStage("idle"); sessionKeyRef.current = null;
    fetchUserObjects();
  }, [account?.address, refreshTick, fetchUserObjects]);

  const minPriceSui = pool ? Number(pool.minPrice) / Number(MIST_PER_SUI) : 0;
  const escrowSui = (parseFloat(price) || 0) * (parseFloat(qty) || 0);

  // ── Submit a blind order (the live hero moment) ─────────────────────────────
  async function handleSubmit() {
    const busy = stage === "hashing" || stage === "sealing" || stage === "walrus" || stage === "submitting";
    if (!account || busy) return;

    // Validate input (guard against NaN / negative / non-finite BigInt throws).
    const priceF = parseFloat(price), qtyF = parseFloat(qty);
    if (!isFinite(priceF) || !isFinite(qtyF) || priceF <= 0 || qtyF <= 0) {
      toast.push({ kind: "error", title: "Enter a valid price and quantity." }); return;
    }
    const priceMist = BigInt(Math.floor(priceF * 1e9));
    const qtyUnits = BigInt(Math.floor(qtyF));
    const escrowMist = priceMist * qtyUnits;
    if (pool && priceMist < BigInt(pool.minPrice)) {
      toast.push({ kind: "error", title: "Price below the pool floor.", detail: `Min ${Number(pool.minPrice) / 1e9} SUI/unit.` }); return;
    }

    // Pre-flight balance check — escrow + gas headroom — so we never hit a cryptic gas error.
    try {
      const bal = BigInt((await withRetry(() => client.getBalance({ owner: account.address }))).totalBalance);
      if (bal < escrowMist + 30_000_000n) {
        toast.push({ kind: "error", title: "Not enough SUI.", detail: `Need ~${(Number(escrowMist) / 1e9 + 0.03).toFixed(3)} SUI (escrow + gas), have ${(Number(bal) / 1e9).toFixed(3)}.` });
        return;
      }
    } catch { /* balance read failed — let the tx itself surface any real shortfall */ }

    const tid = toast.push({ kind: "pending", title: "Sealing your order…" });
    setStage("hashing"); setOrderHash(null); setLastDigest(null); setStatusMsg(null);
    const nonce = generateNonce();
    const hash = computeOrderHash(priceMist, qtyUnits, nonce);
    setOrderHash(bytesToHex(hash));

    const stored = { nonce: nonceToHex(nonce), price: priceMist.toString(), qty: qtyUnits.toString() };
    localStorage.setItem(ORDER_KEY, JSON.stringify(stored));

    // Seal → Walrus backup; non-fatal (localStorage still holds the nonce for reveal).
    let blobIdBytes: number[] | null = null;
    try {
      setStage("sealing"); toast.update(tid, { title: "Encrypting with Seal, backing up to Walrus…" });
      const sealClient = makeSealClient(client as SealCompatibleClient);
      const payload = new TextEncoder().encode(JSON.stringify(stored));
      const encrypted = await sealEncrypt(sealClient, payload, UMBRA_PACKAGE_ID, UMBRA_POOL_ID);
      setStage("walrus");
      const blobId = await walrusStore(encrypted);
      blobIdBytes = Array.from(new TextEncoder().encode(blobId));
    } catch (e) {
      console.warn("Umbra Seal/Walrus backup failed:", e);
      toast.push({ kind: "info", title: "Cloud backup unavailable.", detail: "Order still submits — keep this device to reveal." });
    }

    setStage("submitting"); toast.update(tid, { title: "Broadcasting — nothing for the mempool to see…" });
    const tx = buildSubmitOrderTx(hash, escrowMist, blobIdBytes);
    signAndExecute({ transaction: tx }, {
      onSuccess: (data) => {
        setStage("done"); setLastDigest(data.digest);
        toast.update(tid, { kind: "success", title: "Order live — the mempool saw a 32-byte shadow.", href: txUrl(data.digest) });
        refresh();
      },
      onError: (e) => {
        setStage("error");
        const { kind, msg } = classifyError(e);
        toast.update(tid, { kind: kind === "rejected" ? "info" : "error", title: kind === "rejected" ? "Cancelled in wallet." : "Order failed.", detail: msg });
      },
    });
  }

  function runTx(build: () => ReturnType<typeof buildSettleTx>, pending: string, ok: string) {
    const tid = toast.push({ kind: "pending", title: pending });
    signAndExecute({ transaction: build() }, {
      onSuccess: (data) => { setLastDigest(data.digest); toast.update(tid, { kind: "success", title: ok, href: txUrl(data.digest) }); refresh(); },
      onError: (e) => {
        const { kind, msg } = classifyError(e);
        toast.update(tid, { kind: kind === "rejected" ? "info" : "error", title: kind === "rejected" ? "Cancelled in wallet." : "Transaction failed.", detail: msg });
      },
    });
  }

  // Shared Walrus + Seal recovery: re-derive the order nonce from the on-chain
  // blob, gated by umbra_policy::seal_approve to the order owner.
  const recoverOrderFromChain = useCallback(async (onStep: (s: "session" | "walrus" | "seal") => void): Promise<StoredOrder> => {
    if (!account || !orderBlobId || !orderId) throw new Error("No on-chain backup found for this order.");
    onStep("session");
    if (!sessionKeyRef.current || sessionKeyRef.current.isExpired()) {
      const sk = await SessionKey.create({ address: account.address, packageId: UMBRA_PACKAGE_ID, ttlMin: 10, suiClient: client as SealCompatibleClient });
      const { signature } = await signPersonalMessage({ message: sk.getPersonalMessage() });
      await sk.setPersonalMessageSignature(signature);
      sessionKeyRef.current = sk;
    }
    onStep("walrus");
    const encrypted = await walrusRead(orderBlobId);
    onStep("seal");
    const txBytes = await buildUmbraSealApproveTx(orderId, client as ClientWithCoreApi, account.address);
    const decrypted = await sealDecrypt(makeSealClient(client as SealCompatibleClient), encrypted, sessionKeyRef.current, txBytes);
    const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as StoredOrder;
    const order: StoredOrder = { nonce: parsed.nonce, price: parsed.price, qty: parsed.qty };
    localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    return order;
  }, [account, client, orderBlobId, orderId, signPersonalMessage]);

  function simulateDeviceLoss() {
    localStorage.removeItem(ORDER_KEY);
    sessionKeyRef.current = null;
    setRecoveryStage("wiped");
    toast.push({ kind: "info", title: "Local order key wiped.", detail: "This device can no longer open your order." });
  }

  async function handleRecover() {
    const tid = toast.push({ kind: "pending", title: "Recovering from Walrus + Seal…" });
    try {
      await recoverOrderFromChain((s) => setRecoveryStage(s));
      setRecoveryStage("restored");
      toast.update(tid, { kind: "success", title: "Order recovered — no server ever saw it." });
    } catch (e) {
      setRecoveryStage("error");
      toast.update(tid, { kind: "error", title: "Recovery failed.", detail: classifyError(e).msg });
    }
  }

  async function handleReveal() {
    if (!orderId) { toast.push({ kind: "error", title: "No order to reveal." }); return; }
    let raw = localStorage.getItem(ORDER_KEY);
    if (!raw) {
      if (!orderBlobId) {
        toast.push({ kind: "error", title: "Order nonce isn't on this device.", detail: "No Walrus backup found for this order." });
        return;
      }
      const tid = toast.push({ kind: "pending", title: "Nonce missing — recovering from Walrus + Seal…" });
      try {
        await recoverOrderFromChain((s) => setRecoveryStage(s));
        setRecoveryStage("restored");
        raw = localStorage.getItem(ORDER_KEY);
        toast.update(tid, { kind: "success", title: "Recovered — revealing…" });
      } catch (e) {
        toast.update(tid, { kind: "error", title: "Recovery failed.", detail: classifyError(e).msg });
        return;
      }
    }
    if (!raw) { toast.push({ kind: "error", title: "Order nonce unavailable." }); return; }
    let p: string, q: string, nb: Uint8Array;
    try {
      const parsed = JSON.parse(raw) as StoredOrder;
      p = parsed.price; q = parsed.qty;
      nb = Uint8Array.from(parsed.nonce.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    } catch { toast.push({ kind: "error", title: "Stored order is unreadable." }); return; }
    runTx(() => buildRevealOrderTx(orderId, BigInt(p), BigInt(q), nb), "Revealing order…", "Order revealed — entered into the fair clear.");
  }

  function handleReclaim() {
    if (!orderId) return;
    runTx(() => buildReclaimUnsettledTx(orderId), "Reclaiming escrow…", "Escrow returned — the pool was never settled.");
  }

  const submitting = stage === "hashing" || stage === "sealing" || stage === "walrus" || stage === "submitting";

  // ── Shield panel ────────────────────────────────────────────────────────────
  function ShieldPanel() {
    const btn = "w-full py-3.5 rounded-xl text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none";
    const steps = [{ k: "COMMIT", l: "Submit" }, { k: "REVEAL", l: "Reveal" }, { k: "ENDED", l: "Settle" }, { k: "SETTLED", l: "Claim" }];
    const cur = steps.findIndex((s) => s.k === phase);
    return (
      <div className="rounded-2xl border border-cyan-500/20 bg-zinc-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-cyan-950/10">
          <div className="flex items-center gap-2">
            <IShield className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-zinc-100">The Shield</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-400/60">confidential · Umbra</span>
          </div>
          {phase !== "LOADING" && phase !== "NOT_CONFIGURED" && (
            <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400/80 px-2 py-0.5 rounded-full border border-cyan-500/20">{phase}</span>
          )}
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {phase === "NOT_CONFIGURED" ? (
            <p className="text-sm text-zinc-500 font-mono">Set NEXT_PUBLIC_UMBRA_PACKAGE_ID / _POOL_ID in .env.local.</p>
          ) : !account ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <ILock className="w-6 h-6 text-cyan-400/60" />
              <p className="text-sm text-zinc-400 text-center">Connect to swap without leaking your order.</p>
              <ConnectButton />
            </div>
          ) : (
            <>
              {/* Swap card — Jupiter-style, big clean numbers */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-1">
                <div className="flex items-end justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Quantity</label>
                    <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" inputMode="decimal"
                      className="w-full mt-1 bg-transparent text-3xl font-mono font-semibold text-zinc-50 tabular-nums outline-none placeholder:text-zinc-700" />
                  </div>
                  <span className="text-sm font-mono text-zinc-500 pb-1.5">UMB</span>
                </div>
                <div className="h-px bg-white/[0.06] my-2" />
                <div className="flex items-end justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Max price / unit</label>
                    <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" inputMode="decimal"
                      className="w-full mt-1 bg-transparent text-3xl font-mono font-semibold text-zinc-50 tabular-nums outline-none placeholder:text-zinc-700" />
                  </div>
                  <span className="text-sm font-mono text-zinc-500 pb-1.5">SUI</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono pt-2.5 mt-1 border-t border-white/[0.06]">
                  <span className="text-zinc-500">Escrow</span>
                  <span className="text-zinc-300 tabular-nums">{escrowSui.toFixed(4)} SUI <span className="text-zinc-600">· floor {minPriceSui}</span></span>
                </div>
              </div>

              {/* Stepper — where am I */}
              <div className="flex items-center gap-1.5 px-0.5">
                {steps.map((s, i) => (
                  <div key={s.k} className="flex items-center gap-1.5 flex-1 last:flex-none">
                    <div className={`flex items-center gap-1.5 ${i === cur ? "text-cyan-400" : i < cur ? "text-zinc-400" : "text-zinc-600"}`}>
                      <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-mono tabular-nums ${i === cur ? "border-cyan-400/50 bg-cyan-400/10" : i < cur ? "border-white/15" : "border-white/[0.06]"}`}>
                        {i < cur ? <ICheck className="w-3 h-3" /> : i + 1}
                      </span>
                      <span className="text-[11px] font-medium hidden sm:inline">{s.l}</span>
                    </div>
                    {i < steps.length - 1 && <span className={`flex-1 h-px ${i < cur ? "bg-white/15" : "bg-white/[0.06]"}`} />}
                  </div>
                ))}
              </div>

              {/* Hash hero — the locked, encrypted string */}
              <AnimatePresence>
                {orderHash && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                    className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-cyan-400/80"><ILock className="w-3 h-3" />What the mempool sees</span>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400/50">encrypted</span>
                    </div>
                    <p className="font-mono text-[12px] text-cyan-300 break-all leading-relaxed">{orderHash}</p>
                    <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
                      <span className="text-emerald-400 text-base font-bold tabular-nums">$0</span>
                      <span className="text-[11px] text-zinc-500">extractable · nothing to front-run or reorder</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Phase-aware action area — smooth fades between phases */}
              <AnimatePresence mode="wait">
                <motion.div key={phase} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }} className="space-y-3">

                  {phase === "COMMIT" && !orderId && (
                    <button onClick={handleSubmit} disabled={submitting}
                      className={`${btn} flex items-center justify-center gap-2 text-zinc-950 bg-cyan-400 hover:bg-cyan-300 shadow-[0_0_28px_-8px_rgba(34,211,238,0.6)] disabled:shadow-none`}>
                      {submitting ? <><Spinner className="w-4 h-4" /> Sealing…</> : <>Submit Confidential Order <IArrow className="w-4 h-4" /></>}
                    </button>
                  )}

                  {orderId && phase === "COMMIT" && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
                      <p className="text-[12px] text-zinc-400">Order sealed &amp; escrowed. Reveal opens when the commit window closes.</p>
                      <a href={objUrl(orderId)} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-mono">SealedOrder <IExternal className="w-3 h-3" /></a>
                    </div>
                  )}

                  {/* Lose your device, keep your order — Walrus + Seal recovery */}
                  {orderId && phase === "COMMIT" && orderBlobId && (
                    <div className="rounded-xl border border-fuchsia-500/15 bg-fuchsia-950/[0.08] p-4 space-y-2.5">
                      <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-zinc-500"><ILock className="w-3 h-3 text-fuchsia-400" />Lose your device, keep your order</span>
                      {recoveryStage === "idle" && (
                        <button onClick={simulateDeviceLoss}
                          className="w-full py-2.5 rounded-lg text-xs font-semibold border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-zinc-300 active:scale-[0.98] transition">
                          Simulate device loss →
                        </button>
                      )}
                      {recoveryStage === "wiped" && (
                        <>
                          <p className="text-[11px] text-rose-300">Local key wiped. This device can no longer open the order.</p>
                          <button onClick={handleRecover}
                            className="w-full py-2.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-fuchsia-500 hover:from-cyan-400 hover:to-fuchsia-400 active:scale-[0.98] transition">
                            Recover from Walrus + Seal →
                          </button>
                        </>
                      )}
                      {(recoveryStage === "session" || recoveryStage === "walrus" || recoveryStage === "seal") && (
                        <div className="space-y-1.5">
                          <RecoveryRail stage={recoveryStage} />
                          {recoveryStage === "session" && <p className="text-[10px] text-zinc-500">Sign in your wallet to authorize Seal…</p>}
                        </div>
                      )}
                      {recoveryStage === "restored" && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1.5">
                          <RecoveryRail stage="restored" />
                          <p className="text-[11px] text-emerald-300 font-semibold">Order recovered. No server ever saw it.</p>
                          <button onClick={() => setRecoveryStage("idle")} className="text-[10px] text-zinc-500 hover:text-zinc-300">reset demo</button>
                        </motion.div>
                      )}
                      {recoveryStage === "error" && (
                        <button onClick={handleRecover}
                          className="w-full py-2.5 rounded-lg text-xs font-semibold border border-rose-500/30 bg-rose-950/20 hover:bg-rose-950/30 text-rose-200 active:scale-[0.98] transition">
                          Retry recovery →
                        </button>
                      )}
                    </div>
                  )}

                  {orderId && phase === "REVEAL" && (
                    <button onClick={handleReveal} className={`${btn} flex items-center justify-center gap-2 text-zinc-950 bg-amber-400 hover:bg-amber-300`}>
                      Reveal Order <IArrow className="w-4 h-4" />
                    </button>
                  )}

                  {phase === "ENDED" && !pool?.settled && (
                    <button onClick={() => runTx(buildSettleTx, "Settling via Sui DKG randomness…", "Settled. Fair clear at uniform price.")}
                      className={`${btn} flex items-center justify-center gap-2 text-zinc-950 bg-emerald-400 hover:bg-emerald-300`}>
                      Settle <span className="font-mono opacity-70">sui::random 0x8</span> <IArrow className="w-4 h-4" />
                    </button>
                  )}
                  {phase === "ENDED" && !pool?.settled && orderId && (
                    <button onClick={handleReclaim}
                      className="w-full py-2.5 rounded-xl text-xs font-semibold border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-zinc-400 active:scale-[0.98] transition">
                      Reclaim escrow · escape hatch
                    </button>
                  )}

                  {phase === "SETTLED" && orderId && (
                    <button onClick={() => runTx(() => buildClaimFillTx(orderId, nftId), "Claiming fill…", "Filled. MEV-Shield NFT minted.")}
                      className={`${btn} flex items-center justify-center gap-2 text-zinc-950 bg-emerald-400 hover:bg-emerald-300`}>
                      Claim Fill + MEV-Shield NFT <IArrow className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              </AnimatePresence>

              {nftId && nftStats && (
                <MevShieldCard nftId={nftId} trades={nftStats.trades} totalSavedMist={nftStats.totalSaved} lastSavedMist={nftStats.lastSaved} />
              )}

              {statusMsg && (
                <div className={`flex items-center gap-2 text-[12px] rounded-lg px-3 py-2 font-mono ${stage === "error" || statusMsg.startsWith("Error") ? "bg-rose-950/30 text-rose-300" : stage === "done" ? "bg-emerald-950/30 text-emerald-300" : "bg-white/[0.03] text-zinc-400"}`}>
                  {submitting && <Spinner className="w-3 h-3" />} {statusMsg}
                </div>
              )}
              {lastDigest && (
                <a href={txUrl(lastDigest)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-mono">View tx on SuiScan <IExternal className="w-3 h-3" /></a>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2.5">
        <span className="inline-block text-[11px] font-mono uppercase tracking-[0.25em] text-zinc-500">Same $5,000 swap · two outcomes</span>
        <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-zinc-50">
          They can&apos;t sandwich what they can&apos;t <span className="text-cyan-400">see</span>.
        </h2>
      </div>
      {loadError && !pool && (
        <div className="mx-auto w-fit flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-950/15 px-4 py-2.5 text-[12px] text-amber-200 font-mono">
          <Spinner className="w-3 h-3" /> Reconnecting to the Sui RPC…
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <RektPanel />
        <ShieldPanel />
      </div>
      {pool && (
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-[11px] font-mono text-zinc-600">
          <span className="flex items-center gap-1.5">phase <span className="text-zinc-300">{phase}</span></span>
          <span className="flex items-center gap-1.5">orders <span className="text-zinc-300 tabular-nums">{pool.orderCount}</span></span>
          <span className="flex items-center gap-1.5">revealed <span className="text-zinc-300 tabular-nums">{pool.revealCount}</span></span>
          {pool.settled && <span className="flex items-center gap-1.5">clearing <span className="text-zinc-300 tabular-nums">{Number(pool.clearingPrice) / 1e9} SUI</span></span>}
          <a href={objUrl(UMBRA_POOL_ID)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">pool <IExternal className="w-3 h-3" /></a>
        </div>
      )}
    </div>
  );
}
