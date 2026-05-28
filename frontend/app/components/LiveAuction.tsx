"use client";

import {
  useCurrentAccount,
  useCurrentWallet,
  useSignAndExecuteTransaction,
  useSuiClient,
  useSignTransaction,
  useSignPersonalMessage,
} from "@mysten/dapp-kit";
import { ConnectButton } from "@mysten/dapp-kit";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AUCTION_ID, PACKAGE_ID, CLOCK_ID, RANDOM_ID, MIST_PER_SUI, NETWORK } from "@/lib/constants";
import { computeCommitmentHash, generateNonce, nonceToHex, hexToNonce } from "@/lib/hash";
import { walrusStore, walrusRead } from "@/lib/walrus";
import { useSuiUsdPrice } from "@/lib/pyth";
import { trySponsorTransaction, UserCancelledError } from "@/lib/enoki";
import { makeSealClient, sealEncrypt, sealDecrypt, buildSealApproveTx, SessionKey } from "@/lib/seal";
import { Transaction } from "@mysten/sui/transactions";
import { sha3_256 } from "@noble/hashes/sha3.js";
import type { SealCompatibleClient } from "@mysten/seal";
import type { ClientWithCoreApi } from "@mysten/sui/client";

type AuctionPhase = "LOADING" | "COMMIT" | "REVEAL" | "ENDED" | "RESOLVED" | "NOT_CONFIGURED";

type AuctionState = {
  supply: string;
  minBid: string;
  commitEndMs: number;
  revealEndMs: number;
  resolved: boolean;
  commitCount: number;
  revealCount: number;
};

type StoredBid = { nonce: string; amount: string; blobId?: string };

const NONCE_KEY = `fairdrop_nonce_${AUCTION_ID}`;
const SUISCAN = `https://suiscan.xyz/${NETWORK}`;
const txUrl = (d: string) => `${SUISCAN}/tx/${d}`;
const objUrl = (id: string) => `${SUISCAN}/object/${id}`;

const PHASE_STEPS: AuctionPhase[] = ["COMMIT", "REVEAL", "ENDED", "RESOLVED"];

function getLocalBid(): StoredBid | null {
  try {
    const raw = localStorage.getItem(NONCE_KEY);
    return raw ? (JSON.parse(raw) as StoredBid) : null;
  } catch {
    return null;
  }
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "ended";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

const PHASE_STYLE: Record<string, { bg: string; border: string; label: string }> = {
  COMMIT:   { bg: "bg-blue-950/50",   border: "border-blue-500/30",   label: "text-blue-300" },
  REVEAL:   { bg: "bg-amber-950/50",  border: "border-amber-500/30",  label: "text-amber-300" },
  ENDED:    { bg: "bg-orange-950/50", border: "border-orange-500/30", label: "text-orange-300" },
  RESOLVED: { bg: "bg-emerald-950/50",border: "border-emerald-500/30",label: "text-emerald-300" },
  LOADING:  { bg: "bg-zinc-900/50",   border: "border-zinc-700/30",   label: "text-zinc-400" },
};

export function LiveAuction() {
  const account = useCurrentAccount();
  const { currentWallet } = useCurrentWallet();
  const client = useSuiClient();
  const { mutate: signAndExecute } = useSignAndExecuteTransaction();
  const { mutateAsync: signTx } = useSignTransaction();
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
  const suiUsdPrice = useSuiUsdPrice();

  const [auction, setAuction] = useState<AuctionState | null>(null);
  const [phase, setPhase] = useState<AuctionPhase>("LOADING");
  const [bidAmount, setBidAmount] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [lastTxDigest, setLastTxDigest] = useState<string | null>(null);
  const [resolveDigest, setResolveDigest] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [commitmentId, setCommitmentId] = useState<string | null>(null);
  const [commitmentBlobId, setCommitmentBlobId] = useState<string | null>(null);
  const [certificateId, setCertificateId] = useState<string | null>(null);
  const [creatorCapId, setCreatorCapId] = useState<string | null>(null);
  const [hasLocalNonce, setHasLocalNonce] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [countdown, setCountdown] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [revealedAmount, setRevealedAmount] = useState<string | null>(null);

  const sessionKeyRef = useRef<SessionKey | null>(null);
  const refreshObjects = () => setRefreshTick((t) => t + 1);

  async function execWithFallback(
    tx: Transaction,
    onSuccess: (sponsored: boolean, digest: string) => void,
  ): Promise<void> {
    if (!account) return;
    let result: { digest: string } | null;
    try {
      result = await trySponsorTransaction(tx, account.address, client as ClientWithCoreApi, signTx);
    } catch (err) {
      if (err instanceof UserCancelledError) {
        setTxStatus("Transaction cancelled.");
        return;
      }
      result = null;
    }
    if (result !== null) {
      onSuccess(true, result.digest);
      return;
    }
    return new Promise((resolve) => {
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: (data) => { onSuccess(false, data.digest); resolve(); },
          onError: (e) => { setTxStatus(`Error: ${e.message}`); resolve(); },
        },
      );
    });
  }

  const isZkLoginWallet = currentWallet?.name?.toLowerCase().includes("google") ||
    currentWallet?.name?.toLowerCase().includes("enoki") ||
    currentWallet?.name?.toLowerCase().includes("zk");

  useEffect(() => {
    if (!AUCTION_ID) { setPhase("NOT_CONFIGURED"); return; }
    async function fetchAuction() {
      try {
        const obj = await client.getObject({ id: AUCTION_ID, options: { showContent: true } });
        if (!obj.data?.content || obj.data.content.dataType !== "moveObject") return;
        const f = (obj.data.content as { dataType: "moveObject"; fields: Record<string, unknown> }).fields;
        const now = Date.now();
        const commitEndMs = Number(f.commit_end_ms);
        const revealEndMs = Number(f.reveal_end_ms);
        const resolved = Boolean(f.resolved);
        const commitmentsField = f.commitments as { fields?: { size?: string } } | null;
        const commitCount = Number(commitmentsField?.fields?.size ?? 0);
        const revealsField = f.reveals as { fields?: { contents?: unknown[] } } | null;
        const revealCount = revealsField?.fields?.contents?.length ?? 0;
        setAuction({ supply: String(f.supply), minBid: String(f.min_bid), commitEndMs, revealEndMs, resolved, commitCount, revealCount });
        if (resolved) setPhase("RESOLVED");
        else if (now < commitEndMs) setPhase("COMMIT");
        else if (now < revealEndMs) setPhase("REVEAL");
        else setPhase("ENDED");
      } catch (e) { console.error(e); }
    }
    fetchAuction();
    const id = setInterval(fetchAuction, 10_000);
    return () => clearInterval(id);
  }, [client]);

  useEffect(() => {
    if (!auction) return;
    function tick() {
      const now = Date.now();
      if (auction!.resolved) { setPhase("RESOLVED"); setCountdown(""); }
      else if (now < auction!.commitEndMs) { setPhase("COMMIT"); setCountdown(`Closes in ${formatCountdown(auction!.commitEndMs - now)}`); }
      else if (now < auction!.revealEndMs) { setPhase("REVEAL"); setCountdown(`Closes in ${formatCountdown(auction!.revealEndMs - now)}`); }
      else { setPhase("ENDED"); setCountdown(""); }
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [auction]);

  useEffect(() => {
    setEntryId(null); setCommitmentId(null); setCommitmentBlobId(null);
    setCertificateId(null); setCreatorCapId(null); setHasLocalNonce(false);
    setLastTxDigest(null); setResolveDigest(null); setRevealedAmount(null);
    sessionKeyRef.current = null;
    if (!account?.address || !PACKAGE_ID) return;
    setHasLocalNonce(!!getLocalBid());
    async function fetchUserObjects() {
      try {
        const owned = await client.getOwnedObjects({
          owner: account!.address,
          filter: { Package: PACKAGE_ID },
          options: { showContent: true },
        });
        for (const obj of owned.data) {
          if (!obj.data?.content || obj.data.content.dataType !== "moveObject") continue;
          const content = obj.data.content as { type: string; fields: Record<string, unknown> };
          if (content.type.includes("::auction::Entry")) setEntryId(obj.data.objectId);
          if (content.type.includes("::auction::Commitment")) {
            setCommitmentId(obj.data.objectId);
            const blobIdField = content.fields.blob_id as { fields?: { vec?: string[] } } | null;
            const blobIdB64 = blobIdField?.fields?.vec?.[0] ?? null;
            if (blobIdB64) {
              const bytes = Uint8Array.from(atob(blobIdB64), (c) => c.charCodeAt(0));
              setCommitmentBlobId(new TextDecoder().decode(bytes));
            }
          }
          if (content.type.includes("::auction::WinnerCertificate")) setCertificateId(obj.data.objectId);
          if (content.type.includes("::auction::CreatorCap")) setCreatorCapId(obj.data.objectId);
        }
        // Check if this account has already revealed (persists across refresh)
        try {
          const auctionObj = await client.getObject({ id: AUCTION_ID, options: { showContent: true } });
          if (auctionObj.data?.content?.dataType === "moveObject") {
            const f = (auctionObj.data.content as { dataType: "moveObject"; fields: Record<string, unknown> }).fields;
            const contents = (f.reveals as { fields?: { contents?: { key: string; value: string }[] } })?.fields?.contents ?? [];
            const myReveal = contents.find((r) => r.key === account!.address);
            if (myReveal) setRevealedAmount(myReveal.value);
          }
        } catch { /* non-critical */ }
      } catch (e) { console.error(e); }
    }
    fetchUserObjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.address, client, refreshTick]);

  async function handleRegister() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID) return;
    setIsSubmitting(true); setLastTxDigest(null); setTxStatus("Registering…");
    try {
      const addrBytes = hexToNonce(account.address.replace(/^0x/, "").padStart(64, "0"));
      const auctionIdBytes = hexToNonce(AUCTION_ID.replace(/^0x/, "").padStart(64, "0"));
      const pre = new Uint8Array(addrBytes.length + auctionIdBytes.length);
      pre.set(addrBytes, 0); pre.set(auctionIdBytes, addrBytes.length);
      const nullifier = sha3_256(pre);
      const tx = new Transaction();
      tx.moveCall({ target: `${PACKAGE_ID}::auction::register`, arguments: [tx.object(AUCTION_ID), tx.pure.vector("u8", Array.from(nullifier))] });
      await execWithFallback(tx, (sponsored, digest) => {
        setLastTxDigest(digest);
        setTxStatus(`Registered! Entry minted on-chain.${sponsored ? " Gas sponsored by Enoki." : ""}`);
        refreshObjects();
      });
    } finally { setIsSubmitting(false); }
  }

  async function handleCommit() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID || !entryId || !auction) return;
    setIsSubmitting(true); setLastTxDigest(null);
    try {
      const amountSui = parseFloat(bidAmount);
      if (isNaN(amountSui) || amountSui <= 0) { setTxStatus("Enter a valid bid amount."); return; }
      const amountMist = BigInt(Math.floor(amountSui * 1e9));
      if (amountMist < BigInt(auction.minBid)) { setTxStatus(`Bid below minimum (${Number(BigInt(auction.minBid)) / 1e9} SUI).`); return; }
      setTxStatus("Computing commitment hash…");
      const nonce = generateNonce();
      const hash = computeCommitmentHash(amountMist, nonce);
      const stored: StoredBid = { nonce: nonceToHex(nonce), amount: amountMist.toString() };
      localStorage.setItem(NONCE_KEY, JSON.stringify(stored));
      setHasLocalNonce(true);
      let blobIdBytes: number[] | null = null;
      try {
        setTxStatus("Seal-encrypting nonce and uploading to Walrus…");
        const sealClient = makeSealClient(client as SealCompatibleClient);
        const payload = new TextEncoder().encode(JSON.stringify({ nonce: nonceToHex(nonce), amount: amountMist.toString() }));
        const encrypted = await sealEncrypt(sealClient, payload, PACKAGE_ID, AUCTION_ID);
        const blobId = await walrusStore(encrypted);
        stored.blobId = blobId;
        localStorage.setItem(NONCE_KEY, JSON.stringify(stored));
        blobIdBytes = Array.from(new TextEncoder().encode(blobId));
      } catch (e) { console.warn("Seal/Walrus backup failed:", e); }
      setTxStatus("Fetching coins for escrow…");
      const coinsResult = await client.getCoins({ owner: account.address, coinType: "0x2::sui::SUI" });
      if (!coinsResult.data.length) { setTxStatus("No SUI coins found in wallet."); return; }
      const sortedCoins = [...coinsResult.data].sort((a, b) => BigInt(b.balance) > BigInt(a.balance) ? 1 : -1);
      const totalBalance = sortedCoins.reduce((s, c) => s + BigInt(c.balance), 0n);
      if (totalBalance < amountMist) { setTxStatus(`Insufficient balance. Need ${Number(amountMist) / 1e9} SUI, have ${(Number(totalBalance) / 1e9).toFixed(4)} SUI.`); return; }
      setTxStatus("Submitting blind bid…");
      const tx = new Transaction();
      const singleCoin = sortedCoins.find(c => BigInt(c.balance) >= amountMist);
      let escrowCoin;
      if (singleCoin) {
        [escrowCoin] = tx.splitCoins(tx.object(singleCoin.coinObjectId), [tx.pure.u64(amountMist)]);
      } else {
        const [primary, ...rest] = sortedCoins;
        if (rest.length > 0) tx.mergeCoins(tx.object(primary.coinObjectId), rest.map(c => tx.object(c.coinObjectId)));
        [escrowCoin] = tx.splitCoins(tx.object(primary.coinObjectId), [tx.pure.u64(amountMist)]);
      }
      tx.moveCall({
        target: `${PACKAGE_ID}::auction::commit_bid`,
        arguments: [tx.object(AUCTION_ID), tx.object(entryId), tx.pure.vector("u8", Array.from(hash)), escrowCoin, tx.pure.option("vector<u8>", blobIdBytes ?? undefined), tx.object(CLOCK_ID)],
      });
      const blobNote = blobIdBytes ? " Nonce Seal-encrypted & backed up to Walrus." : "";
      await execWithFallback(tx, (sponsored, digest) => {
        setLastTxDigest(digest);
        setTxStatus(`Bid committed! Amount hidden until reveal.${blobNote}${sponsored ? " Gas sponsored by Enoki." : ""}`);
        refreshObjects();
      });
    } finally { setIsSubmitting(false); }
  }

  async function handleReveal() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID || !commitmentId) return;
    setIsSubmitting(true); setLastTxDigest(null);
    let storedBid: StoredBid | null = getLocalBid();
    if (!storedBid && commitmentBlobId && entryId) {
      try {
        setTxStatus("Recovering nonce via Seal + Walrus…");
        if (!sessionKeyRef.current || sessionKeyRef.current.isExpired()) {
          const sk = await SessionKey.create({ address: account.address, packageId: PACKAGE_ID, ttlMin: 10, suiClient: client as SealCompatibleClient });
          setTxStatus("Sign the Seal session key in your wallet…");
          const { signature } = await signPersonalMessage({ message: sk.getPersonalMessage() });
          await sk.setPersonalMessageSignature(signature);
          sessionKeyRef.current = sk;
        }
        setTxStatus("Fetching encrypted nonce from Walrus…");
        const encrypted = await walrusRead(commitmentBlobId);
        setTxStatus("Decrypting with Seal threshold encryption…");
        const txBytes = await buildSealApproveTx(entryId, client as ClientWithCoreApi, account.address);
        const decrypted = await sealDecrypt(makeSealClient(client as SealCompatibleClient), encrypted, sessionKeyRef.current, txBytes);
        const { nonce, amount } = JSON.parse(new TextDecoder().decode(decrypted)) as StoredBid;
        storedBid = { nonce, amount };
        localStorage.setItem(NONCE_KEY, JSON.stringify(storedBid));
        setHasLocalNonce(true);
      } catch (e) {
        setTxStatus(`Seal/Walrus recovery failed: ${e instanceof Error ? e.message : String(e)}`);
        setIsSubmitting(false); return;
      }
    }
    if (!storedBid) { setTxStatus("Nonce not found. localStorage cleared and no Walrus backup."); setIsSubmitting(false); return; }
    const nonce = hexToNonce(storedBid.nonce);
    const amountMist = BigInt(storedBid.amount);
    setTxStatus("Revealing bid…");
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::auction::reveal_bid`, arguments: [tx.object(AUCTION_ID), tx.object(commitmentId), tx.pure.u64(amountMist), tx.pure.vector("u8", Array.from(nonce)), tx.object(CLOCK_ID)] });
    signAndExecute({ transaction: tx }, {
      onSuccess: (data) => { setIsSubmitting(false); setLastTxDigest(data.digest); setTxStatus("Bid revealed!"); setRevealedAmount(amountMist.toString()); localStorage.removeItem(NONCE_KEY); setHasLocalNonce(false); refreshObjects(); },
      onError: (e) => { setIsSubmitting(false); setTxStatus(`Error: ${e.message}`); },
    });
  }

  async function handleResolve() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID) return;
    setIsSubmitting(true); setLastTxDigest(null); setTxStatus("Resolving with Sui DKG randomness…");
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::auction::resolve`, arguments: [tx.object(AUCTION_ID), tx.object(RANDOM_ID), tx.object(CLOCK_ID)] });
    signAndExecute({ transaction: tx }, {
      onSuccess: (data) => { setIsSubmitting(false); setLastTxDigest(data.digest); setResolveDigest(data.digest); setTxStatus("Resolved. Winners selected via Sui DKG."); refreshObjects(); },
      onError: (e) => { setIsSubmitting(false); setTxStatus(`Error: ${e.message}`); },
    });
  }

  async function handleClaim() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID || !certificateId || !commitmentId) return;
    setIsSubmitting(true); setLastTxDigest(null); setTxStatus("Claiming allocation…");
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::auction::claim`, arguments: [tx.object(AUCTION_ID), tx.object(certificateId), tx.object(commitmentId)] });
    signAndExecute({ transaction: tx }, {
      onSuccess: (data) => { setIsSubmitting(false); setLastTxDigest(data.digest); setTxStatus("Claimed! Allocation confirmed."); setCertificateId(null); setCommitmentId(null); refreshObjects(); },
      onError: (e) => { setIsSubmitting(false); setTxStatus(`Error: ${e.message}`); },
    });
  }

  async function handleReclaimEscrow() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID || !commitmentId) return;
    setIsSubmitting(true); setLastTxDigest(null); setTxStatus("Reclaiming escrow…");
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::auction::reclaim_escrow`, arguments: [tx.object(AUCTION_ID), tx.object(commitmentId), tx.object(CLOCK_ID)] });
    signAndExecute({ transaction: tx }, {
      onSuccess: (data) => { setIsSubmitting(false); setLastTxDigest(data.digest); setTxStatus("Escrow returned to wallet."); setCommitmentId(null); refreshObjects(); },
      onError: (e) => { setIsSubmitting(false); setTxStatus(`Error: ${e.message}`); },
    });
  }

  async function handleWithdrawProceeds() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID || !creatorCapId) return;
    setIsSubmitting(true); setLastTxDigest(null); setTxStatus("Withdrawing proceeds…");
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::auction::withdraw_proceeds`, arguments: [tx.object(AUCTION_ID), tx.object(creatorCapId)] });
    signAndExecute({ transaction: tx }, {
      onSuccess: (data) => { setIsSubmitting(false); setLastTxDigest(data.digest); setTxStatus("Proceeds withdrawn."); },
      onError: (e) => { setIsSubmitting(false); setTxStatus(`Error: ${e.message}`); },
    });
  }

  const formatUsd = (sui: number) => suiUsdPrice !== null ? ` ($${(sui * suiUsdPrice).toFixed(2)})` : "";
  const minBidSui = auction ? Number(BigInt(auction.minBid) / MIST_PER_SUI) : 0;
  const bidAmountUsd = bidAmount && suiUsdPrice ? formatUsd(parseFloat(bidAmount)) : "";
  const phaseIdx = PHASE_STEPS.indexOf(phase as AuctionPhase);
  const ps = PHASE_STYLE[phase] ?? PHASE_STYLE.LOADING;

  if (phase === "NOT_CONFIGURED") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-zinc-500 text-sm">
        Set NEXT_PUBLIC_PACKAGE_ID and NEXT_PUBLIC_AUCTION_ID in .env.local
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg">

      {/* Trust strip */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {["No backend", "No admin key", "100% on-chain", "Explorer verifiable"].map((t) => (
          <span key={t} className="text-[10px] text-zinc-600 flex items-center gap-1 font-mono">
            <span className="text-emerald-700">✓</span>{t}
          </span>
        ))}
      </div>

      {/* Phase timeline */}
      {phase !== "LOADING" && (
        <div className="flex items-center gap-1 text-xs select-none">
          {PHASE_STEPS.map((p, i) => {
            const isCurrent = phase === p;
            const isPast = phaseIdx > i;
            return (
              <span key={p} className="flex items-center gap-1">
                <span className={isCurrent ? "text-white font-semibold" : isPast ? "text-zinc-600" : "text-zinc-800"}>
                  {isPast ? "✓" : isCurrent ? "●" : "○"} {p}
                </span>
                {i < PHASE_STEPS.length - 1 && <span className="text-zinc-800 mx-0.5">→</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Phase banner */}
      <div className={`px-4 py-3 rounded-xl border ${ps.bg} ${ps.border}`}>
        <div className="flex items-center justify-between">
          <span className={`text-sm font-semibold ${ps.label}`}>{phase}</span>
          {countdown && <span className="text-xs text-zinc-500">{countdown}</span>}
        </div>
        <div className="text-xs text-zinc-500 mt-1 flex flex-wrap gap-x-3">
          <span>Supply: {auction?.supply ?? "…"}</span>
          <span>Min bid: {minBidSui} SUI{formatUsd(minBidSui)}</span>
          {auction && auction.commitCount > 0 && <span>{auction.commitCount} committed</span>}
          {auction && auction.revealCount > 0 && <span>{auction.revealCount} revealed</span>}
        </div>
        {suiUsdPrice && <p className="text-[10px] text-zinc-700 mt-1 font-mono">1 SUI = ${suiUsdPrice.toFixed(3)}</p>}
      </div>

      {/* Resolve verifiability banner */}
      {resolveDigest && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3 space-y-2">
          <p className="text-emerald-400 text-sm font-semibold">Winners selected via Sui validator DKG</p>
          <p className="text-zinc-400 text-xs">
            <a href={objUrl(RANDOM_ID)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">sui::random at 0x8 ↗</a>
            {" "}consumed in resolution. Outcome permanent and publicly verifiable.
          </p>
          <a href={txUrl(resolveDigest)} target="_blank" rel="noopener noreferrer" className="block text-blue-400 text-xs hover:underline">
            Verify resolution on SuiScan ↗
          </a>
        </div>
      )}

      {/* Transaction status */}
      {txStatus && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
          {txStatus}
        </div>
      )}

      {/* Last tx link */}
      {lastTxDigest && (
        <div className="flex items-center gap-3 text-xs text-zinc-600 font-mono">
          <span>{lastTxDigest.slice(0, 20)}…</span>
          <a href={txUrl(lastTxDigest)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline whitespace-nowrap">
            View on SuiScan ↗
          </a>
          <button onClick={() => navigator.clipboard.writeText(lastTxDigest)} className="hover:text-zinc-400">copy</button>
        </div>
      )}

      {/* Object links */}
      {(entryId || commitmentId || certificateId) && (
        <div className="flex flex-wrap gap-3 text-xs">
          {entryId && <a href={objUrl(entryId)} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-300 font-mono">Entry ↗</a>}
          {commitmentId && <a href={objUrl(commitmentId)} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-300 font-mono">Commitment ↗</a>}
          {certificateId && <a href={objUrl(certificateId)} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:text-emerald-400 font-mono">WinnerCertificate ↗</a>}
        </div>
      )}

      {/* zkLogin hint */}
      {account && !isZkLoginWallet && phase === "COMMIT" && !entryId && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 px-3 py-2 text-xs text-amber-300">
          For full Sybil resistance, connect via <strong>Continue with Google</strong> (zkLogin) in the wallet modal.
        </div>
      )}

      {!account && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-6 py-8 flex flex-col items-center gap-4">
          <p className="text-zinc-400 text-sm">Connect a wallet to participate.</p>
          <ConnectButton />
        </div>
      )}

      {account && (
        <div className="space-y-3">

          {/* Step 1: Register */}
          {!entryId && phase === "COMMIT" && (
            <section className="space-y-2">
              <p className="text-zinc-500 text-xs uppercase tracking-widest">Step 1 — Register</p>
              <button onClick={handleRegister} disabled={isSubmitting}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${isSubmitting ? "opacity-50 cursor-not-allowed bg-violet-800" : "bg-violet-600 hover:bg-violet-500"}`}>
                {isSubmitting ? "Registering…" : isZkLoginWallet ? "Register with Google (zkLogin) →" : "Register →"}
              </button>
              <p className="text-zinc-600 text-xs">One entry per wallet. {isZkLoginWallet ? "Gas sponsored by Enoki." : ""}</p>
            </section>
          )}

          {/* Step 2: Commit */}
          {entryId && !commitmentId && phase === "COMMIT" && (
            <section className="space-y-2">
              <p className="text-zinc-500 text-xs uppercase tracking-widest">Step 2 — Blind Bid</p>
              <div className="relative">
                <input type="number" placeholder={`Bid amount (SUI, min ${minBidSui})`} value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/10 focus:border-white/20 px-3 py-2.5 rounded-xl text-sm pr-24 outline-none transition-colors" />
                {bidAmountUsd && <span className="absolute right-3 top-2.5 text-zinc-500 text-sm pointer-events-none">{bidAmountUsd}</span>}
              </div>
              <button onClick={handleCommit} disabled={isSubmitting}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${isSubmitting ? "opacity-50 cursor-not-allowed bg-violet-800" : "bg-violet-600 hover:bg-violet-500"}`}>
                {isSubmitting ? "Committing…" : "Commit Bid (hidden until reveal) →"}
              </button>
              <p className="text-zinc-600 text-xs">Nonce Seal-encrypted and backed up to Walrus.</p>
            </section>
          )}

          {commitmentId && phase === "COMMIT" && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-500 uppercase tracking-widest">Sealed bid</span>
                <span className="text-amber-500 text-base">🔒</span>
              </div>
              <div className="font-mono text-2xl font-bold text-amber-500/60 tracking-[0.15em]">???  SUI</div>
              <p className="text-[11px] text-zinc-600 mt-1.5">Amount hidden from validators, MEV bots, and other bidders. Reveal phase opens soon.</p>
            </div>
          )}

          {/* Step 3: Reveal */}
          {commitmentId && phase === "REVEAL" && (
            <section className="space-y-3">
              <p className="text-zinc-500 text-xs uppercase tracking-widest">Step 3 — Reveal</p>

              <AnimatePresence mode="wait">
                {!revealedAmount ? (
                  <motion.div
                    key="sealed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
                    className="rounded-xl border border-amber-500/25 bg-amber-950/15 px-4 py-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-zinc-500 uppercase tracking-widest">Sealed bid</span>
                      <motion.span
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ duration: 2.5, repeat: Infinity }}
                        className="text-amber-500 text-base"
                      >🔒</motion.span>
                    </div>
                    <div className="font-mono text-2xl font-bold text-amber-500/50 tracking-[0.2em] select-none">???  SUI</div>
                    <p className="text-[11px] text-zinc-600 mt-1.5">Amount hidden from everyone until you reveal.</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="revealed"
                    initial={{ opacity: 0, scale: 0.88, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ type: "spring", damping: 22, stiffness: 200, delay: 0.08 }}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-zinc-500 uppercase tracking-widest">Bid revealed</span>
                      <span className="text-emerald-400 text-base">✓</span>
                    </div>
                    <div className="font-mono text-2xl font-bold text-emerald-300 tracking-tight">
                      {(Number(BigInt(revealedAmount)) / 1e9).toFixed(3)} SUI
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-1.5">On-chain. Entered into winner selection.</p>
                  </motion.div>
                )}
              </AnimatePresence>

              {!revealedAmount && (
                <>
                  {!hasLocalNonce && commitmentBlobId && (
                    <p className="text-amber-400 text-xs">Recovering via Seal + Walrus (blob: {commitmentBlobId.slice(0, 12)}…)</p>
                  )}
                  {!hasLocalNonce && !commitmentBlobId && (
                    <p className="text-red-400 text-xs">localStorage cleared and no Walrus backup. Reveal may fail.</p>
                  )}
                  <button onClick={handleReveal} disabled={isSubmitting}
                    className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${isSubmitting ? "opacity-50 cursor-not-allowed bg-amber-800" : "bg-amber-600 hover:bg-amber-500"}`}>
                    {isSubmitting ? "Revealing bid…" : "Reveal Bid →"}
                  </button>
                </>
              )}
            </section>
          )}

          {/* Step 4: Resolve */}
          {phase === "ENDED" && (
            <section className="space-y-2">
              <p className="text-zinc-500 text-xs uppercase tracking-widest">Step 4 — Resolve</p>
              <button onClick={handleResolve} disabled={isSubmitting}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${isSubmitting ? "opacity-50 cursor-not-allowed bg-emerald-900" : "bg-emerald-700 hover:bg-emerald-600"}`}>
                {isSubmitting ? "Resolving…" : "Resolve Auction (Sui DKG 0x8) →"}
              </button>
              <p className="text-zinc-600 text-xs">
                Uses <a href={objUrl(RANDOM_ID)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">sui::random at 0x8 ↗</a> — callable by anyone.
              </p>
              {commitmentId && !revealedAmount && (
                <button onClick={handleReclaimEscrow} disabled={isSubmitting}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold border transition-colors ${isSubmitting ? "opacity-50 cursor-not-allowed border-white/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
                  {isSubmitting ? "Reclaiming…" : "Reclaim Escrow (did not reveal) →"}
                </button>
              )}
            </section>
          )}

          {/* Post-resolution */}
          {phase === "RESOLVED" && (
            <section className="space-y-3">
              {certificateId && commitmentId && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", damping: 20, stiffness: 260 }}
                  className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-4 py-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-emerald-300 text-sm font-bold">WinnerCertificate minted</span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-3">Your address was selected by Sui validator DKG randomness. Allocation is yours.</p>
                  <button onClick={handleClaim} disabled={isSubmitting}
                    className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${isSubmitting ? "opacity-50 cursor-not-allowed bg-emerald-900" : "bg-emerald-600 hover:bg-emerald-500"}`}>
                    {isSubmitting ? "Claiming…" : "Claim Allocation →"}
                  </button>
                </motion.div>
              )}
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 px-4 py-3">
                <p className="text-emerald-400 text-sm font-semibold">Auction resolved.</p>
              {!certificateId && commitmentId && (
                <button onClick={handleReclaimEscrow} disabled={isSubmitting}
                  className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${isSubmitting ? "opacity-50 cursor-not-allowed" : "bg-white/5 hover:bg-white/10 border border-white/10"}`}>
                  {isSubmitting ? "Reclaiming…" : "Reclaim Escrow (bid not selected) →"}
                </button>
              )}
              {creatorCapId && (
                <button onClick={handleWithdrawProceeds} disabled={isSubmitting}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold border transition-colors ${isSubmitting ? "opacity-50 cursor-not-allowed border-white/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
                  {isSubmitting ? "Withdrawing…" : "Withdraw Proceeds (creator) →"}
                </button>
              )}
              {!certificateId && !commitmentId && !creatorCapId && (
                <p className="text-zinc-500 text-sm">No pending actions for this wallet.</p>
              )}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}
