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
import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AUCTION_ID, PACKAGE_ID, CLOCK_ID, RANDOM_ID, MIST_PER_SUI, NETWORK } from "@/lib/constants";
import { computeCommitmentHash, generateNonce, nonceToHex, hexToNonce } from "@/lib/hash";
import { walrusStore, walrusRead } from "@/lib/walrus";
import { useSuiUsdPrice } from "@/lib/pyth";
import { trySponsorTransaction, UserCancelledError } from "@/lib/enoki";
import { makeSealClient, sealEncrypt, sealDecrypt, buildSealApproveTx, SessionKey } from "@/lib/seal";
import { PolicySeam } from "@/app/components/PolicySeam";
import { Transaction } from "@mysten/sui/transactions";
import { sha3_256 } from "@noble/hashes/sha3.js";
import type { SealCompatibleClient } from "@mysten/seal";
import type { ClientWithCoreApi } from "@mysten/sui/client";
import { useToast } from "@/app/components/Toast";
import { classifyError } from "@/lib/errors";

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

type UserSnapshot = {
  entryId: string | null;
  commitmentId: string | null;
  commitmentBlobId: string | null;
  certificateId: string | null;
  creatorCapId: string | null;
  revealedAmount: string | null;
};

const NONCE_KEY = `fairdrop_nonce_${AUCTION_ID}`;
const SUISCAN = `https://suiscan.xyz/${NETWORK}`;
const txUrl = (d: string) => `${SUISCAN}/tx/${d}`;
const objUrl = (id: string) => `${SUISCAN}/object/${id}`;

const PHASE_STEPS: AuctionPhase[] = ["COMMIT", "REVEAL", "ENDED", "RESOLVED"];

// Enoki sponsorship needs a private key + server proxy (the public-key client
// path 403s), so it never succeeds in the no-backend MVP. Attempting it anyway
// added a dead API round-trip (~hundreds of ms) to every register/commit before
// falling back to self-pay. Skip it. Flip to true only once a server-side
// sponsor endpoint exists.
const SPONSOR_ENABLED = false;

function Spinner({ className = "" }: { className?: string }) {
  return <span className={`inline-block w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`} aria-hidden />;
}

// Shared inline icon set (matches UmbraTerminal — same stroke language, no emoji).
function Icon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ILock = (p: { className?: string }) => <Icon className={p.className} d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />;
const IArrow = (p: { className?: string }) => <Icon className={p.className} d="M5 12h14m-6-6 6 6-6 6" />;
const ICheck = (p: { className?: string }) => <Icon className={p.className} d="M20 6 9 17l-5-5" />;
const IDice = (p: { className?: string }) => <Icon className={p.className} d="M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" />;

// Recovery centerpiece — device-loss → Walrus → Seal → restored.
type RecoveryStage = "idle" | "wiped" | "session" | "walrus" | "seal" | "restored" | "error";
type NodeState = "idle" | "active" | "done";

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

function getLocalBid(): StoredBid | null {
  try {
    const raw = localStorage.getItem(NONCE_KEY);
    return raw ? (JSON.parse(raw) as StoredBid) : null;
  } catch {
    return null;
  }
}

// Move Option<vector<u8>> arrives in several shapes depending on RPC/SDK serialization:
// flat bytes [n,...], wrapper {vec:[...]} / {fields:{vec:[...]}}, a base64 string, or empty = None.
// The fullnode serializes the Some payload as a flat byte array, which the old
// {fields:{vec:[...]}} reader missed — so every backed-up bid showed "No Walrus backup".
function decodeBlobId(raw: unknown): string | null {
  if (raw == null) return null;
  let v: unknown = raw;
  if (!Array.isArray(v) && typeof v === "object") {
    const o = v as { vec?: unknown; fields?: { vec?: unknown } };
    v = o.vec ?? o.fields?.vec ?? v;
  }
  if (!Array.isArray(v) || v.length === 0) return null; // None
  const b: unknown = Array.isArray(v[0]) ? v[0] : (typeof v[0] === "string" ? v[0] : v);
  try {
    if (typeof b === "string") return new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
    if (Array.isArray(b)) return new TextDecoder().decode(Uint8Array.from(b as number[]));
  } catch { return null; }
  return null;
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
  const toast = useToast();

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
  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [recoveryStage, setRecoveryStage] = useState<RecoveryStage>("idle");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveredAmount, setRecoveredAmount] = useState<string | null>(null);

  const sessionKeyRef = useRef<SessionKey | null>(null);
  const refreshObjects = () => setRefreshTick((t) => t + 1);

  async function execWithFallback(
    tx: Transaction,
    onSuccess: (sponsored: boolean, digest: string) => void | Promise<void>,
  ): Promise<void> {
    if (!account) return;
    let result: { digest: string } | null = null;
    if (SPONSOR_ENABLED) {
      try {
        result = await trySponsorTransaction(tx, account.address, client as ClientWithCoreApi, signTx);
      } catch (err) {
        if (err instanceof UserCancelledError) {
          setTxStatus(null);
          toast.push({ kind: "info", title: "Cancelled in wallet." });
          return;
        }
        result = null;
      }
    }
    if (result !== null) {
      await onSuccess(true, result.digest);
      return;
    }
    return new Promise((resolve) => {
      signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (data) => { await onSuccess(false, data.digest); resolve(); },
          onError: (e) => {
            setTxStatus(null);
            const { kind, msg } = classifyError(e);
            toast.push({ kind: kind === "rejected" ? "info" : "error", title: kind === "rejected" ? "Cancelled in wallet." : "Transaction failed.", detail: msg });
            resolve();
          },
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

  // Live mirror of the connected address — lets an in-flight poll detect an account switch and abort.
  const accountRef = useRef<string | undefined>(account?.address);
  useEffect(() => { accountRef.current = account?.address; }, [account?.address]);

  // Fetch the connected account's on-chain objects; sets state AND returns a snapshot.
  const fetchUserObjects = useCallback(async (): Promise<UserSnapshot> => {
    const snap: UserSnapshot = { entryId: null, commitmentId: null, commitmentBlobId: null, certificateId: null, creatorCapId: null, revealedAmount: null };
    if (!account?.address || !PACKAGE_ID) return snap;
    try {
      // Paginate: a reused demo wallet accumulates >50 objects (the default page
      // size), so the relevant Entry/Commitment/Cert can sit past page 1. Without
      // the cursor loop the UI silently shows "not registered" → the "did it work?"
      // failure this whole phase exists to kill.
      const ownedData: Awaited<ReturnType<typeof client.getOwnedObjects>>["data"] = [];
      let cursor: string | null | undefined = null;
      do {
        const page = await client.getOwnedObjects({
          owner: account.address,
          filter: { Package: PACKAGE_ID },
          options: { showContent: true },
          cursor,
        });
        ownedData.push(...page.data);
        cursor = page.hasNextPage ? page.nextCursor : null;
      } while (cursor);
      // Scope every owned object to the CURRENT auction. Entry/Commitment/Cert/
      // CreatorCap all carry an `auction_id` field; a wallet reused across auctions
      // otherwise picks up a stale Commitment from a dead auction and feeds its
      // long-expired Walrus blob into recovery → "Walrus read failed: 404".
      const normId = (s: unknown) =>
        typeof s === "string" ? s.replace(/^0x/, "").toLowerCase().padStart(64, "0") : "";
      const wantAuction = normId(AUCTION_ID);
      for (const obj of ownedData) {
        if (!obj.data?.content || obj.data.content.dataType !== "moveObject") continue;
        const content = obj.data.content as { type: string; fields: Record<string, unknown> };
        if (normId(content.fields.auction_id) !== wantAuction) continue; // ignore other auctions
        if (content.type.includes("::auction::Entry")) { snap.entryId = obj.data.objectId; setEntryId(obj.data.objectId); }
        if (content.type.includes("::auction::Commitment")) {
          snap.commitmentId = obj.data.objectId; setCommitmentId(obj.data.objectId);
          const decoded = decodeBlobId(content.fields.blob_id);
          if (decoded) { snap.commitmentBlobId = decoded; setCommitmentBlobId(decoded); }
        }
        if (content.type.includes("::auction::WinnerCertificate")) { snap.certificateId = obj.data.objectId; setCertificateId(obj.data.objectId); }
        if (content.type.includes("::auction::CreatorCap")) { snap.creatorCapId = obj.data.objectId; setCreatorCapId(obj.data.objectId); }
      }
      try {
        const auctionObj = await client.getObject({ id: AUCTION_ID, options: { showContent: true } });
        if (auctionObj.data?.content?.dataType === "moveObject") {
          const f = (auctionObj.data.content as { dataType: "moveObject"; fields: Record<string, unknown> }).fields;
          const contents = (f.reveals as { fields?: { contents?: { key: string; value: string }[] } })?.fields?.contents ?? [];
          const myReveal = contents.find((r) => r.key === account.address);
          if (myReveal) { snap.revealedAmount = myReveal.value; setRevealedAmount(myReveal.value); }
        }
      } catch { /* non-critical */ }
    } catch (e) { console.error(e); }
    return snap;
  }, [client, account?.address]);

  // Bounded poll after a tx: re-fetch until `predicate` is satisfied (object indexed) or ~10s elapses.
  // Returns true if confirmed, false on timeout. Aborts if the account changes mid-poll.
  const pollForState = useCallback(async (predicate: (s: UserSnapshot) => boolean): Promise<boolean> => {
    const startedFor = account?.address;
    for (let i = 0; i < 8; i++) {
      const snap = await fetchUserObjects();
      if (accountRef.current !== startedFor) return false;
      if (predicate(snap)) return true;
      await new Promise((r) => setTimeout(r, 1200));
    }
    return false;
  }, [fetchUserObjects, account?.address]);

  // Reset per-account state, then load objects (also re-runs on refreshObjects()/account change).
  useEffect(() => {
    setEntryId(null); setCommitmentId(null); setCommitmentBlobId(null);
    setCertificateId(null); setCreatorCapId(null); setHasLocalNonce(false);
    setLastTxDigest(null); setResolveDigest(null); setRevealedAmount(null);
    setRecoveryStage("idle"); setRecoveredAmount(null); setRecoveryError(null);
    sessionKeyRef.current = null;
    if (!account?.address || !PACKAGE_ID) return;
    setHasLocalNonce(!!getLocalBid());
    fetchUserObjects();
  }, [account?.address, refreshTick, fetchUserObjects]);

  // SUI balance for the wallet-context strip (P0-3)
  useEffect(() => {
    if (!account?.address) { setBalance(null); return; }
    let cancelled = false;
    client.getBalance({ owner: account.address })
      .then((b) => { if (!cancelled) setBalance(BigInt(b.totalBalance)); })
      .catch(() => {});
    return () => { cancelled = true; };
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
      await execWithFallback(tx, async (sponsored, digest) => {
        setLastTxDigest(digest);
        setTxStatus("Registered — confirming on-chain…");
        const ok = await pollForState((s) => !!s.entryId);
        setTxStatus(ok
          ? `Registered! Entry minted on-chain.${sponsored ? " Gas sponsored by Enoki." : ""}`
          : "Registered on-chain — syncing… open the tx in Explorer; refresh if the step doesn't advance.");
        toast.push({ kind: "success", title: ok ? "Registered — Entry minted." : "Registered — syncing on-chain…", href: txUrl(digest) });
      });
    } finally { setIsSubmitting(false); }
  }

  async function handleCommit() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID || !entryId || !auction) return;
    setIsSubmitting(true); setLastTxDigest(null);
    try {
      const amountSui = parseFloat(bidAmount);
      if (isNaN(amountSui) || amountSui <= 0) { toast.push({ kind: "error", title: "Enter a valid bid amount." }); return; }
      const amountMist = BigInt(Math.floor(amountSui * 1e9));
      if (amountMist < BigInt(auction.minBid)) { toast.push({ kind: "error", title: "Bid below the minimum.", detail: `Min ${Number(BigInt(auction.minBid)) / 1e9} SUI.` }); return; }
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
      } catch (e) {
        console.warn("Seal/Walrus backup failed:", e);
        toast.push({ kind: "info", title: "Cloud backup unavailable.", detail: "Bid still commits — keep this device to reveal." });
      }
      setTxStatus("Fetching coins for escrow…");
      const coinsResult = await client.getCoins({ owner: account.address, coinType: "0x2::sui::SUI" });
      if (!coinsResult.data.length) { setTxStatus(null); toast.push({ kind: "error", title: "No SUI in this wallet.", detail: "Fund it from the faucet first." }); return; }
      const sortedCoins = [...coinsResult.data].sort((a, b) => BigInt(b.balance) > BigInt(a.balance) ? 1 : -1);
      const totalBalance = sortedCoins.reduce((s, c) => s + BigInt(c.balance), 0n);
      if (totalBalance < amountMist) { setTxStatus(null); toast.push({ kind: "error", title: "Not enough SUI.", detail: `Need ${Number(amountMist) / 1e9} SUI, have ${(Number(totalBalance) / 1e9).toFixed(4)}.` }); return; }
      setTxStatus("Submitting blind bid…");
      const tx = new Transaction();
      // Split escrow from the gas coin (self-pay path): splitting from an explicit coin
      // object collided with gas selection on a single funded coin → "No valid gas coins found".
      const [escrowCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountMist)]);
      tx.moveCall({
        target: `${PACKAGE_ID}::auction::commit_bid`,
        arguments: [tx.object(AUCTION_ID), tx.object(entryId), tx.pure.vector("u8", Array.from(hash)), escrowCoin, tx.pure.option("vector<u8>", blobIdBytes ?? undefined), tx.object(CLOCK_ID)],
      });
      const blobNote = blobIdBytes ? " Nonce Seal-encrypted & backed up to Walrus." : "";
      await execWithFallback(tx, async (sponsored, digest) => {
        setLastTxDigest(digest);
        setTxStatus("Bid committed — confirming on-chain…");
        const ok = await pollForState((s) => !!s.commitmentId);
        setTxStatus(ok
          ? `Bid committed! Amount hidden until reveal.${blobNote}${sponsored ? " Gas sponsored by Enoki." : ""}`
          : "Bid committed on-chain — syncing… open the tx in Explorer; refresh if it doesn't update.");
        toast.push({ kind: "success", title: ok ? "Bid committed — hidden until reveal." : "Bid committed — syncing on-chain…", href: txUrl(digest) });
      });
    } finally { setIsSubmitting(false); }
  }

  // Shared Walrus + Seal recovery: re-derive the nonce from the on-chain blob,
  // gated by seal_approve to the Entry owner. Used by both the reveal flow and
  // the device-loss recovery centerpiece.
  async function recoverNonceFromChain(onStep: (s: "session" | "walrus" | "seal") => void): Promise<StoredBid> {
    if (!account || !PACKAGE_ID || !commitmentBlobId || !entryId) {
      throw new Error("No on-chain backup found for this bid.");
    }
    onStep("session");
    if (!sessionKeyRef.current || sessionKeyRef.current.isExpired()) {
      const sk = await SessionKey.create({ address: account.address, packageId: PACKAGE_ID, ttlMin: 10, suiClient: client as SealCompatibleClient });
      const { signature } = await signPersonalMessage({ message: sk.getPersonalMessage() });
      await sk.setPersonalMessageSignature(signature);
      sessionKeyRef.current = sk;
    }
    onStep("walrus");
    const encrypted = await walrusRead(commitmentBlobId);
    onStep("seal");
    const txBytes = await buildSealApproveTx(entryId, client as ClientWithCoreApi, account.address);
    const decrypted = await sealDecrypt(makeSealClient(client as SealCompatibleClient), encrypted, sessionKeyRef.current, txBytes);
    const { nonce, amount } = JSON.parse(new TextDecoder().decode(decrypted)) as StoredBid;
    const bid: StoredBid = { nonce, amount };
    localStorage.setItem(NONCE_KEY, JSON.stringify(bid));
    setHasLocalNonce(true);
    return bid;
  }

  // Centerpiece: wipe the local nonce so this device can no longer open the bid.
  function simulateDeviceLoss() {
    localStorage.removeItem(NONCE_KEY);
    setHasLocalNonce(false);
    sessionKeyRef.current = null;
    setRecoveredAmount(null);
    setRecoveryError(null);
    setRecoveryStage("wiped");
  }

  // Centerpiece: pull the sealed bid back from Walrus + Seal, driving the rail.
  async function handleRecover() {
    setRecoveryError(null);
    const tid = toast.push({ kind: "pending", title: "Recovering from Walrus + Seal…" });
    try {
      const bid = await recoverNonceFromChain((s) => setRecoveryStage(s));
      setRecoveredAmount(bid.amount);
      setRecoveryStage("restored");
      toast.update(tid, { kind: "success", title: "Bid recovered — no server ever saw it." });
    } catch (e) {
      setRecoveryError(e instanceof Error ? e.message : String(e));
      setRecoveryStage("error");
      toast.update(tid, { kind: "error", title: "Recovery failed.", detail: classifyError(e).msg });
    }
  }

  async function handleReveal() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID || !commitmentId) return;
    setIsSubmitting(true); setLastTxDigest(null);
    let storedBid: StoredBid | null = getLocalBid();
    if (!storedBid && commitmentBlobId && entryId) {
      try {
        storedBid = await recoverNonceFromChain((s) => {
          setTxStatus(
            s === "session" ? "Sign the Seal session key in your wallet…"
              : s === "walrus" ? "Fetching encrypted nonce from Walrus…"
              : "Decrypting with Seal threshold encryption…",
          );
        });
      } catch (e) {
        setTxStatus(null);
        toast.push({ kind: "error", title: "Seal/Walrus recovery failed.", detail: classifyError(e).msg });
        setIsSubmitting(false); return;
      }
    }
    if (!storedBid) {
      toast.push({ kind: "error", title: "Bid nonce unavailable.", detail: "localStorage cleared and no Walrus backup for this bid." });
      setIsSubmitting(false); return;
    }
    const nonce = hexToNonce(storedBid.nonce);
    const amountMist = BigInt(storedBid.amount);
    try {
      setTxStatus("Revealing bid…");
      const tx = new Transaction();
      tx.moveCall({ target: `${PACKAGE_ID}::auction::reveal_bid`, arguments: [tx.object(AUCTION_ID), tx.object(commitmentId), tx.pure.u64(amountMist), tx.pure.vector("u8", Array.from(nonce)), tx.object(CLOCK_ID)] });
      await execWithFallback(tx, async (_sponsored, digest) => {
        setLastTxDigest(digest);
        setTxStatus("Bid revealed — confirming on-chain…");
        setRevealedAmount(amountMist.toString());            // optimistic focal flip
        localStorage.removeItem(NONCE_KEY); setHasLocalNonce(false);
        const ok = await pollForState((s) => !!s.revealedAmount);
        setTxStatus(ok
          ? "Bid revealed! Entered into winner selection."
          : "Bid revealed on-chain — syncing… open the tx in Explorer; refresh if it doesn't update.");
        toast.push({ kind: "success", title: ok ? "Bid revealed — entered into the draw." : "Bid revealed — syncing on-chain…", href: txUrl(digest) });
      });
    } finally { setIsSubmitting(false); }
  }

  async function handleResolve() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID) return;
    setIsSubmitting(true); setLastTxDigest(null); setTxStatus("Resolving with Sui DKG randomness…");
    const tid = toast.push({ kind: "pending", title: "Resolving via Sui DKG randomness…" });
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::auction::resolve`, arguments: [tx.object(AUCTION_ID), tx.object(RANDOM_ID), tx.object(CLOCK_ID)] });
    signAndExecute({ transaction: tx }, {
      onSuccess: (data) => { setIsSubmitting(false); setLastTxDigest(data.digest); setResolveDigest(data.digest); setTxStatus(null); toast.update(tid, { kind: "success", title: "Resolved — winners selected via Sui DKG.", href: txUrl(data.digest) }); refreshObjects(); },
      onError: (e) => { setIsSubmitting(false); setTxStatus(null); const { kind, msg } = classifyError(e); toast.update(tid, { kind: kind === "rejected" ? "info" : "error", title: kind === "rejected" ? "Cancelled in wallet." : "Resolve failed.", detail: msg }); },
    });
  }

  async function handleClaim() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID || !certificateId || !commitmentId) return;
    setIsSubmitting(true); setLastTxDigest(null); setTxStatus("Claiming allocation…");
    try {
      const tx = new Transaction();
      tx.moveCall({ target: `${PACKAGE_ID}::auction::claim`, arguments: [tx.object(AUCTION_ID), tx.object(certificateId), tx.object(commitmentId)] });
      await execWithFallback(tx, async (_sponsored, digest) => {
        setLastTxDigest(digest);
        setTxStatus("Claimed — confirming on-chain…");
        setCertificateId(null); setCommitmentId(null);       // optimistic
        const ok = await pollForState((s) => !s.certificateId);
        setTxStatus(ok
          ? "Claimed! Allocation confirmed."
          : "Claim submitted on-chain — syncing… open the tx in Explorer; refresh if it doesn't update.");
        toast.push({ kind: "success", title: ok ? "Claimed — allocation confirmed." : "Claim submitted — syncing on-chain…", href: txUrl(digest) });
      });
    } finally { setIsSubmitting(false); }
  }

  async function handleReclaimEscrow() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID || !commitmentId) return;
    setIsSubmitting(true); setLastTxDigest(null); setTxStatus("Reclaiming escrow…");
    const tid = toast.push({ kind: "pending", title: "Reclaiming escrow…" });
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::auction::reclaim_escrow`, arguments: [tx.object(AUCTION_ID), tx.object(commitmentId), tx.object(CLOCK_ID)] });
    signAndExecute({ transaction: tx }, {
      onSuccess: (data) => { setIsSubmitting(false); setLastTxDigest(data.digest); setTxStatus(null); toast.update(tid, { kind: "success", title: "Escrow returned to your wallet.", href: txUrl(data.digest) }); setCommitmentId(null); refreshObjects(); },
      onError: (e) => { setIsSubmitting(false); setTxStatus(null); const { kind, msg } = classifyError(e); toast.update(tid, { kind: kind === "rejected" ? "info" : "error", title: kind === "rejected" ? "Cancelled in wallet." : "Reclaim failed.", detail: msg }); },
    });
  }

  async function handleWithdrawProceeds() {
    if (isSubmitting || !account || !PACKAGE_ID || !AUCTION_ID || !creatorCapId) return;
    setIsSubmitting(true); setLastTxDigest(null); setTxStatus("Withdrawing proceeds…");
    const tid = toast.push({ kind: "pending", title: "Withdrawing proceeds…" });
    const tx = new Transaction();
    tx.moveCall({ target: `${PACKAGE_ID}::auction::withdraw_proceeds`, arguments: [tx.object(AUCTION_ID), tx.object(creatorCapId)] });
    signAndExecute({ transaction: tx }, {
      onSuccess: (data) => { setIsSubmitting(false); setLastTxDigest(data.digest); setTxStatus(null); toast.update(tid, { kind: "success", title: "Proceeds withdrawn.", href: txUrl(data.digest) }); },
      onError: (e) => { setIsSubmitting(false); setTxStatus(null); const { kind, msg } = classifyError(e); toast.update(tid, { kind: kind === "rejected" ? "info" : "error", title: kind === "rejected" ? "Cancelled in wallet." : "Withdraw failed.", detail: msg }); },
    });
  }

  const formatUsd = (sui: number) => suiUsdPrice !== null ? ` ($${(sui * suiUsdPrice).toFixed(2)})` : "";
  const minBidSui = auction ? Number(auction.minBid) / Number(MIST_PER_SUI) : 0;
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
    <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-3">

      {/* ───────────────── LEFT — THE AUCTION (live state) ───────────────── */}
      <div className="lg:col-span-2 space-y-4">

        {/* Big phase + countdown */}
        <div className={`rounded-2xl border px-5 py-4 ${ps.bg} ${ps.border}`}>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.2em] mb-1.5">The auction · live on testnet</p>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${phase === "LOADING" ? "bg-zinc-600" : "bg-current animate-pulse"} ${ps.label}`} />
                <span className={`text-2xl font-bold tracking-tight ${ps.label}`}>{phase === "LOADING" ? "Loading…" : phase}</span>
              </div>
            </div>
            {countdown && (
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Closes in</p>
                <p className="font-mono text-3xl font-bold text-white tabular-nums leading-none mt-1">{countdown.replace(/^Closes in\s*/i, "")}</p>
              </div>
            )}
          </div>
        </div>

        {/* Phase stepper */}
        {phase !== "LOADING" && (
          <div className="flex items-center gap-1.5 px-0.5 select-none">
            {PHASE_STEPS.map((p, i) => {
              const label = ({ COMMIT: "Commit", REVEAL: "Reveal", ENDED: "Resolve", RESOLVED: "Claim" } as Record<string, string>)[p] ?? p;
              const isCurrent = phase === p;
              const isPast = phaseIdx > i;
              return (
                <div key={p} className="flex items-center gap-1.5 flex-1 last:flex-none">
                  <div className={`flex items-center gap-1.5 ${isCurrent ? "text-emerald-400" : isPast ? "text-zinc-400" : "text-zinc-600"}`}>
                    <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-mono tabular-nums ${isCurrent ? "border-emerald-400/50 bg-emerald-400/10" : isPast ? "border-white/15" : "border-white/[0.06]"}`}>
                      {isPast ? <ICheck className="w-3 h-3" /> : i + 1}
                    </span>
                    <span className="text-[11px] font-medium hidden sm:inline">{label}</span>
                  </div>
                  {i < PHASE_STEPS.length - 1 && <span className={`flex-1 h-px ${isPast ? "bg-white/15" : "bg-white/[0.06]"}`} />}
                </div>
              );
            })}
          </div>
        )}

        {/* Live stats — the alive signal */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { k: "Supply", v: auction ? String(auction.supply) : "…" },
            { k: "Min bid", v: auction ? `${minBidSui} SUI` : "…" },
            { k: "Committed", v: auction ? String(auction.commitCount) : "…" },
            { k: "Revealed", v: auction ? String(auction.revealCount) : "…" },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-3">
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-1">{s.k}</p>
              <p className="text-xl font-bold text-zinc-100 tabular-nums">{s.v}</p>
            </div>
          ))}
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

        {/* Verify on-chain footer */}
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] px-4 py-3 space-y-2">
          <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em]">Verify on-chain</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {["No backend", "No admin key", "100% on-chain", "Explorer verifiable"].map((t) => (
              <span key={t} className="text-[10px] text-zinc-600 flex items-center gap-1 font-mono"><span className="text-emerald-700">✓</span>{t}</span>
            ))}
          </div>
          {(entryId || commitmentId || certificateId) && (
            <div className="flex flex-wrap gap-3 text-xs">
              {entryId && <a href={objUrl(entryId)} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-300 font-mono">Entry ↗</a>}
              {commitmentId && <a href={objUrl(commitmentId)} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-300 font-mono">Commitment ↗</a>}
              {certificateId && <a href={objUrl(certificateId)} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:text-emerald-400 font-mono">WinnerCertificate ↗</a>}
            </div>
          )}
          {suiUsdPrice && <p className="text-[10px] text-zinc-700 font-mono">1 SUI = ${suiUsdPrice.toFixed(3)}</p>}
        </div>
      </div>

      {/* ───────────────── RIGHT — YOUR PARTICIPATION ───────────────── */}
      <div className="lg:col-span-1 space-y-3 lg:sticky lg:top-20 self-start">
        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.2em]">Your participation</p>

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

          {/* Connected wallet context — address · network · balance · ready (P0-3) */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-zinc-400 break-all">{account.address}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(account.address); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-md border border-white/10 text-zinc-300 hover:bg-white/[0.06] transition-colors">
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-cyan-400">{NETWORK === "testnet" ? "Testnet" : NETWORK}</span>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-300">{balance === null ? "… SUI" : `${(Number(balance) / 1e9).toFixed(3)} SUI`}</span>
              <span className="text-zinc-700">·</span>
              {balance !== null && balance > 0n
                ? <span className="text-emerald-400">✓ ready to transact</span>
                : <span className="text-amber-400">fund wallet to transact</span>}
            </div>
          </div>

          {/* Progress checklist — what you've done */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono">
            {[
              { k: "Registered", done: !!entryId },
              { k: "Committed", done: !!commitmentId || !!revealedAmount },
              { k: "Revealed", done: !!revealedAmount },
            ].map((s) => (
              <span key={s.k} className={s.done ? "text-emerald-400" : "text-zinc-600"}>{s.done ? "✓" : "○"} {s.k}</span>
            ))}
          </div>

          {/* Step 1: Register */}
          {!entryId && phase === "COMMIT" && (
            <section className="space-y-2">
              <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em]">Step 1 — Register</p>
              <button onClick={handleRegister} disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                {isSubmitting ? <><Spinner className="w-4 h-4" /> Registering…</> : <>{isZkLoginWallet ? "Register with Google" : "Register"} <IArrow className="w-4 h-4" /></>}
              </button>
              <p className="text-zinc-600 text-xs">One entry per wallet. {isZkLoginWallet ? "Gas sponsored by Enoki." : ""}</p>
            </section>
          )}

          {/* Step 2: Commit — vault deposit */}
          {entryId && !commitmentId && phase === "COMMIT" && (
            <section className="space-y-2">
              <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-[0.2em]">Step 2 — Blind Bid</p>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                <label className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Your bid</label>
                <div className="flex items-end justify-between gap-3 mt-1">
                  <input type="number" inputMode="decimal" placeholder="0.0" value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    className="w-full bg-transparent text-3xl font-mono font-semibold text-zinc-50 tabular-nums outline-none placeholder:text-zinc-700" />
                  <span className="text-sm font-mono text-zinc-500 pb-1.5">SUI</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono pt-2.5 mt-2 border-t border-white/[0.06]">
                  <span className="text-zinc-500">min {minBidSui} SUI</span>
                  {bidAmountUsd && <span className="text-zinc-400 tabular-nums">{bidAmountUsd.replace(/[() ]/g, "")}</span>}
                </div>
              </div>
              <button onClick={handleCommit} disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                {isSubmitting ? <><Spinner className="w-4 h-4" /> Committing…</> : <><ILock className="w-4 h-4" /> Commit Blind Bid</>}
              </button>
              <p className="text-zinc-600 text-xs">Nonce Seal-encrypted &amp; backed up to Walrus.</p>
            </section>
          )}

          {commitmentId && phase === "COMMIT" && (() => {
            // Change A — the owner sees their own stake; the chain still stores only the hash.
            const heldBid = getLocalBid();
            const heldAmountMist = recoveredAmount ?? heldBid?.amount ?? null;
            const heldAmountSui = heldAmountMist ? (Number(BigInt(heldAmountMist)) / 1e9).toFixed(3) : null;
            const keyFp = heldBid?.nonce ? `${heldBid.nonce.slice(0, 6)}…${heldBid.nonce.slice(-4)}` : null;
            return (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", damping: 20, stiffness: 240 }}
              className="rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">You hold the only key</span>
                <ILock className="w-4 h-4 text-amber-400" />
              </div>

              {/* Change A — owner sees the real stake; everyone else sees ??? */}
              {heldAmountSui ? (
                <>
                  <div className="font-mono text-2xl font-bold text-amber-300 tracking-tight">
                    {heldAmountSui} SUI <span className="text-amber-500/40 text-sm font-normal">in escrow</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    <span className="text-amber-500/70">??? to validators, MEV bots, every rival</span> — only you can see this.
                  </p>
                </>
              ) : (
                <>
                  <div className="font-mono text-2xl font-bold text-red-400/70 tracking-[0.15em]">???  SUI</div>
                  <p className="text-[11px] text-red-300/80 mt-1">The only key to this bid is gone from this device.</p>
                </>
              )}

              {/* Change B — the three stakes that genuinely exist */}
              <div className="mt-3 space-y-1 text-[11px] leading-relaxed">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-amber-400 flex-shrink-0">●</span>
                  <span className="text-zinc-400">
                    <span className="text-zinc-200 font-semibold">One 32-byte key</span> opens this bid
                    {keyFp ? <> — <span className="font-mono text-amber-300">{keyFp}</span>, the only copy that can.</> : <>. The only copy that can.</>}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-pink-400 flex-shrink-0">●</span>
                  <span className="text-zinc-400">No server, no FairDrop team can open it for you. <span className="text-zinc-200">Not even to help.</span></span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-zinc-500 flex-shrink-0">●</span>
                  <span className="text-zinc-400">One entry, one bid. <span className="text-zinc-200">Miss reveal and the escrow locks forever.</span></span>
                </div>
              </div>

              {/* Recovery — resting-state spoiler removed; the rescue lives behind the loss */}
              {commitmentBlobId ? (
                <div className="mt-3 pt-3 border-t border-amber-500/15 space-y-2">
                  {recoveryStage === "idle" && (
                    <button onClick={simulateDeviceLoss}
                      className="w-full py-2.5 rounded-lg text-xs font-semibold border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-zinc-300 active:scale-[0.98] transition">
                      Simulate device loss →
                    </button>
                  )}
                  {recoveryStage === "wiped" && (
                    <>
                      <p className="text-[11px] text-rose-300">Local key wiped. This device can no longer open the bid.</p>
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
                      <p className="text-[11px] text-emerald-300 font-semibold">
                        Bid recovered{recoveredAmount ? ` — ${(Number(BigInt(recoveredAmount)) / 1e9).toFixed(3)} SUI` : ""}. No server ever saw it.
                      </p>
                      <button onClick={() => setRecoveryStage("idle")} className="text-[10px] text-zinc-500 hover:text-zinc-300">reset demo</button>
                    </motion.div>
                  )}
                  {recoveryStage === "error" && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-red-300">Recovery failed: {recoveryError}</p>
                      <button onClick={handleRecover}
                        className="w-full py-2 rounded-lg text-xs font-semibold border border-red-500/30 bg-red-950/20 hover:bg-red-950/30 text-red-200 transition-colors">
                        Retry recovery →
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-3 pt-3 border-t border-amber-500/15 text-[11px] text-zinc-600">
                  No Walrus backup for this bid — keep this device to reveal.
                </p>
              )}
            </motion.div>
            );
          })()}

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
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Sealed bid</span>
                      <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2.5, repeat: Infinity }} className="text-amber-400">
                        <ILock className="w-4 h-4" />
                      </motion.span>
                    </div>
                    <div className="font-mono text-3xl font-bold text-amber-500/50 tracking-[0.2em] select-none">???  SUI</div>
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
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Bid revealed</span>
                      <ICheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="font-mono text-3xl font-bold text-emerald-300 tracking-tight tabular-nums">
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
                    className="w-full py-3.5 rounded-xl text-sm font-semibold text-zinc-950 bg-amber-400 hover:bg-amber-300 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                    {isSubmitting ? <><Spinner className="w-4 h-4" /> Revealing…</> : <>Reveal Bid <IArrow className="w-4 h-4" /></>}
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
                className="w-full py-3.5 rounded-xl text-sm font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                {isSubmitting ? <><Spinner className="w-4 h-4" /> Resolving…</> : <><IDice className="w-4 h-4" /> Resolve Auction</>}
              </button>
              <p className="text-zinc-600 text-xs">
                Uses <a href={objUrl(RANDOM_ID)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">sui::random at 0x8 ↗</a> — callable by anyone.
              </p>
              {commitmentId && !revealedAmount && (
                <button onClick={handleReclaimEscrow} disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-zinc-400 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none">
                  {isSubmitting ? "Reclaiming…" : "Reclaim escrow · did not reveal"}
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
                    <span className="text-emerald-400"><ICheck className="w-4 h-4" /></span>
                    <span className="text-emerald-300 text-sm font-bold">WinnerCertificate minted</span>
                  </div>
                  <p className="text-xs text-zinc-400 mb-3">Your address was selected by Sui validator DKG randomness. Allocation is yours.</p>
                  <button onClick={handleClaim} disabled={isSubmitting}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold text-zinc-950 bg-emerald-400 hover:bg-emerald-300 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
                    {isSubmitting ? <><Spinner className="w-4 h-4" /> Claiming…</> : <>Claim Allocation <IArrow className="w-4 h-4" /></>}
                  </button>
                </motion.div>
              )}
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 px-4 py-3">
                <p className="text-emerald-400 text-sm font-semibold">Auction resolved.</p>
              {!certificateId && commitmentId && (
                <button onClick={handleReclaimEscrow} disabled={isSubmitting}
                  className="w-full py-3 rounded-xl text-sm font-semibold border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] text-zinc-300 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none">
                  {isSubmitting ? "Reclaiming…" : "Reclaim escrow · not selected"}
                </button>
              )}
              {creatorCapId && (
                <button onClick={handleWithdrawProceeds} disabled={isSubmitting}
                  className="w-full py-2.5 rounded-xl text-xs font-semibold border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-zinc-400 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none">
                  {isSubmitting ? "Withdrawing…" : "Withdraw proceeds · creator"}
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

      {/* Transaction status — state-aware, loud (P0-2) */}
      {txStatus && (() => {
        const pending = isSubmitting;
        const success = !pending && /(registered!|committed!|revealed!|resolved|claimed|recovered|syncing)/i.test(txStatus);
        const error = !pending && /(error|failed|cancelled|insufficient|no sui|below min|not found)/i.test(txStatus);
        const tone = pending
          ? "border-amber-500/40 bg-amber-950/30 text-amber-200"
          : success ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-200"
          : error ? "border-red-500/40 bg-red-950/30 text-red-200"
          : "border-white/10 bg-white/[0.03] text-zinc-300";
        return (
          <motion.div key={`${pending}-${success}-${error}`} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium ${tone}`}>
            {pending && <Spinner />}
            {success && <ICheck className="w-4 h-4 text-emerald-400" />}
            <span>{txStatus}</span>
          </motion.div>
        );
      })()}

      {lastTxDigest && (
        <div className="flex items-center gap-2 text-xs text-zinc-600 font-mono flex-wrap">
          <a href={txUrl(lastTxDigest)} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline whitespace-nowrap">View tx on SuiScan ↗</a>
          <button onClick={() => navigator.clipboard.writeText(lastTxDigest)} className="hover:text-zinc-400">copy digest</button>
        </div>
      )}

      </div>
    </div>

      {/* Option B seam — the primitive reveal, surfaced at the recovery moment */}
      {recoveryStage === "restored" && <PolicySeam />}
    </div>
  );
}
