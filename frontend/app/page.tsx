"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ConnectButton } from "@mysten/dapp-kit";
import { LiveAuction } from "@/app/components/LiveAuction";
import { RecoveryHero } from "@/app/components/RecoveryHero";
import { ArchitectureFlow } from "@/app/components/ArchitectureFlow";
import Image from "next/image";
import { PACKAGE_ID, AUCTION_ID, RANDOM_ID, NETWORK } from "@/lib/constants";

// ─── Icons ───────────────────────────────────────────────────────────────────

function Icon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICheck = (p: { className?: string }) => <Icon className={p.className} d="M20 6 9 17l-5-5" />;
const IExternal = (p: { className?: string }) => <Icon className={p.className} d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />;
const IChevron = (p: { className?: string }) => <Icon className={p.className} d="M9 6l6 6-6 6" />;
const IBolt = (p: { className?: string }) => <Icon className={p.className} d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />;
const PATH_BOT = "M12 8V4H8M4 8h16v12H4zM2 14h2m16 0h2M9 13v2m6-2v2";
const PATH_EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
const PATH_DICE = "M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01";

// ─── Explorer helpers ─────────────────────────────────────────────────────────

const SUISCAN = `https://suiscan.xyz/${NETWORK}`;
const objUrl = (id: string) => `${SUISCAN}/object/${id}`;

// ─── Motion variants ──────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const PROBLEMS = [
  {
    icon: PATH_BOT,
    title: "Bots steal allocations",
    body: "Bots watch the mempool and submit higher bids in the same block. Public bids are weapons for front-running.",
    fix: "Blind bids — no amount on-chain until reveal. Nothing to front-run.",
  },
  {
    icon: PATH_EYE,
    title: "Whales see your bid",
    body: "In public auctions, large holders watch submissions and shade their bid above yours at the last second.",
    fix: "Every bid is a hash until reveal phase. Whales can't see, can't shade.",
  },
  {
    icon: PATH_DICE,
    title: "Nobody verifies the draw",
    body: "The organizer controls winner selection. \"Random\" just means they said so. No proof exists.",
    fix: "sui::random at 0x8 — validator DKG. On-chain. Auditable forever.",
  },
];

const FAIRNESS = [
  {
    title: "Google-Gated Entry",
    body: "OAuth-gated entry, raising Sybil attack costs. A Google login is required to register, and each address registers exactly once — a per-registration nullifier is committed on-chain via sha3_256. This makes multi-wallet farming expensive. Not proof-of-personhood.",
    accent: "text-blue-500",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-zinc-500 bg-zinc-50 border border-zinc-100 px-2 py-0.5 rounded-lg text-[10px]">Wallet addr</span>
        <span className="text-zinc-300">→</span>
        <span className="text-blue-500 text-[10px]">sha3_256</span>
        <span className="text-zinc-300">→</span>
        <span className="text-blue-600 text-[10px] bg-blue-50 px-1.5 py-0.5 rounded-lg border border-blue-100">0x4f2a…</span>
      </div>
    ),
  },
  {
    title: "Hidden Bids",
    body: "sha3_256(amount ‖ nonce) committed on-chain before any amount is visible. No MEV. No last-second sniping. Amount unknowable until reveal.",
    accent: "text-amber-500",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-100 text-[10px]">5.0 SUI</span>
        <span className="text-zinc-300">→</span>
        <span className="text-amber-500 text-[10px]">sha3_256</span>
        <span className="text-zinc-300">→</span>
        <span className="text-zinc-400 text-[10px] tracking-wider">0x7c1b…????</span>
      </div>
    ),
  },
  {
    title: "Verifiable Randomness",
    body: "Ties broken by sui::random at 0x8, backed by Sui's validator distributed key generation. The outcome is on-chain, permanent, and inspectable by anyone.",
    accent: "text-violet-500",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-zinc-400 text-[10px]">validator DKG</span>
        <span className="text-zinc-300">→</span>
        <span className="text-violet-600 font-bold px-2 py-0.5 rounded-lg bg-violet-50 border border-violet-100">0x8</span>
        <span className="text-zinc-300">→</span>
        <span className="text-violet-500 text-[10px]">winner ✓</span>
      </div>
    ),
  },
  {
    title: "Trustless Settlement",
    body: "Trustless pull-settlement pattern: winners claim, losers reclaim, the creator withdraws — each a permissionless on-chain call. No admin can seize or block funds, and no batch failure can strand anyone.",
    accent: "text-emerald-500",
    visual: (
      <div className="font-mono text-[10px] space-y-1">
        <div className="text-emerald-600">✓ winners → allocation + escrow change</div>
        <div className="text-zinc-400">↩ losers → full escrow refund</div>
        <div className="text-zinc-400">→ creator → proceeds</div>
      </div>
    ),
  },
];

const STEPS = [
  { num: "01", label: "Register with Google", desc: "OAuth-gated entry, raising Sybil attack costs. A Google login is required to register, and each address registers exactly once: a per-registration nullifier is committed on-chain, and a second registration from the same address or nullifier is rejected. This raises the cost of multi-wallet farming — not proof-of-personhood." },
  { num: "02", label: "Seal your bid", desc: "You choose an amount and submit sha3_256(amount ‖ nonce). The hash commits you to the bid without revealing it. Miners, validators, and every other bidder see only a 32-byte hash until reveal. Front-running requires seeing the bid. You made that impossible." },
  { num: "03", label: "Reveal when the phase opens", desc: "After the commit window closes, you send your actual amount and nonce. The contract recomputes the hash and verifies it matches exactly. Reveal a different amount: rejected. Reveal late: rejected. No flexibility, by design." },
  { num: "04", label: "Anyone calls resolve", desc: "No admin required. Anyone calls resolve and the contract does the work: sort bids, find the clearing price, break ties using sui::random at 0x8. Validator DKG randomness — no single party can predict or bias it. The outcome is on-chain and permanent." },
  { num: "05", label: "Settle, then claim", desc: "resolve runs once: it sorts bids, finds the clearing price, breaks ties with sui::random, and mints a WinnerCertificate to every winner — all in one PTB. Settlement is then pull-based: winners claim, losers reclaim their full escrow, the creator withdraws proceeds. Each is a separate permissionless call." },
];

const PRIMITIVES = [
  { name: "Seal", by: "Kostas Chalkias", desc: "Threshold-encrypts your reveal secret. An on-chain Move policy (seal_approve) releases it only to you, only during reveal — no FairDrop server can decrypt it.", color: "text-pink-600", dot: "bg-pink-400" },
  { name: "Walrus", by: "Mysten Labs", desc: "Decentralized blob storage for the encrypted secret. Recoverable from any device — no backend, no team custody.", color: "text-cyan-600", dot: "bg-cyan-400" },
  { name: "zkLogin", by: "Deepak Maram", desc: "Google login instead of a wallet — the same login re-derives the same wallet on any device. Raises Sybil cost; not proof-of-personhood.", color: "text-blue-600", dot: "bg-blue-400" },
  { name: "sui::random", by: "Andrew Schran", desc: "Validator DKG randomness at object 0x8. Unpredictable before the transaction. Unbiasable by any party.", color: "text-violet-600", dot: "bg-violet-400" },
  { name: "Enoki", by: "Mysten Labs", desc: "The zkLogin auth flow behind the Google button — onboards users with no seed phrase and no extension. Gas is self-paid on testnet.", color: "text-orange-600", dot: "bg-orange-400" },
  { name: "PTBs", by: "Sui protocol", desc: "Programmable Transaction Blocks compose many Move calls into one atomic transaction — resolve mints every WinnerCertificate in a single PTB. Final settlement is pull-based.", color: "text-emerald-600", dot: "bg-emerald-400" },
];

const RECEIPTS = [
  { label: "Package contract", id: PACKAGE_ID, hint: "auction + seal_policy Move source · immutable" },
  { label: "Live auction object", id: AUCTION_ID, hint: "commitments, reveals & winners tables · live state" },
  { label: "sui::random (0x8)", id: RANDOM_ID, hint: "validator DKG · consumed in every resolve tx" },
  { label: "Clock (0x6)", id: "0x6", hint: "timestamp source for phase gating" },
];

// ─── Shared design tokens ─────────────────────────────────────────────────────

const CARD = "rounded-[2rem] bg-white border border-black/[0.04] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.06)]";
const CARD_SM = "rounded-2xl bg-white border border-black/[0.04] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.05)]";
const BTN_PRIMARY = "inline-flex items-center gap-2 rounded-full px-6 py-3 bg-zinc-900 text-white text-sm font-semibold hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 active:scale-[0.98]";
const BTN_SECONDARY = "inline-flex items-center gap-2 rounded-full px-6 py-3 border border-black/[0.1] bg-white text-zinc-700 text-sm font-semibold hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 active:scale-[0.98]";
const EYEBROW = "text-xs text-zinc-400 font-medium uppercase tracking-widest mb-3";
const H2 = "text-3xl lg:text-5xl font-bold text-zinc-800 tracking-tight";

// ─── Components ───────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-black/[0.05] bg-white/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="" width={28} height={28} className="rounded-md" />
          <span className="text-zinc-900 font-bold text-lg tracking-tight">FairDrop</span>
          <span className="hidden sm:block text-[10px] text-zinc-400 font-medium border border-black/[0.06] rounded-full px-2.5 py-0.5 bg-zinc-50">
            Sui Overflow 2026
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a href="#how" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors px-3 py-1.5 rounded-full hover:bg-zinc-50 hidden md:block">How it works</a>
          <a href="#why-sui" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors px-3 py-1.5 rounded-full hover:bg-zinc-50 hidden md:block">Why Sui</a>
          <a href="#auction" className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors px-3 py-1.5 rounded-full hover:bg-zinc-50 hidden md:block">Live auction</a>
          <a href="/umbra" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 border border-blue-200 rounded-full px-3 py-1.5 hover:bg-blue-50 transition-all duration-200"><IBolt className="w-3.5 h-3.5" /> Umbra</a>
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden">

      {/* Circuit-trace SVG network — desktop only, purely decorative */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none hidden lg:block"
        viewBox="0 0 1280 780"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        {/* ── Top-left floater → center headline ── */}
        <path d="M 225 178 L 318 178 Q 338 178 338 198 L 338 262 Q 338 285 362 285 L 492 285"
          fill="none" stroke="#e4e4e7" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="492" cy="285" r="3" fill="#d4d4d8" />

        {/* ── Center → left bottom mini-card (sui::random) ── */}
        <path d="M 492 320 L 362 320 Q 338 320 338 345 L 338 412 Q 338 432 318 432 L 225 432"
          fill="none" stroke="#e4e4e7" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="225" cy="432" r="3" fill="#d4d4d8" />

        {/* ── Top-right floater → center headline ── */}
        <path d="M 1055 162 L 962 162 Q 942 162 942 182 L 942 262 Q 942 285 918 285 L 788 285"
          fill="none" stroke="#e4e4e7" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="788" cy="285" r="3" fill="#d4d4d8" />

        {/* ── Center → right bottom mini-card (Walrus) ── */}
        <path d="M 788 320 L 918 320 Q 942 320 942 345 L 942 412 Q 942 432 962 432 L 1055 432"
          fill="none" stroke="#e4e4e7" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="1055" cy="432" r="3" fill="#d4d4d8" />

        {/* ── Center downward trace → next section ── */}
        <line x1="640" y1="560" x2="640" y2="680"
          stroke="#e4e4e7" strokeWidth="1" strokeDasharray="4 4" strokeLinecap="round" />

        {/* ── Ambient corner circuit traces ── */}
        <path d="M 0 50 L 72 50 Q 90 50 90 68 L 90 130" fill="none" stroke="#ececee" strokeWidth="1" />
        <path d="M 1280 36 L 1208 36 Q 1190 36 1190 54 L 1190 120" fill="none" stroke="#ececee" strokeWidth="1" />
        <path d="M 0 720 L 88 720 Q 106 720 106 702 L 106 640" fill="none" stroke="#ececee" strokeWidth="1" />
        <path d="M 1280 700 L 1192 700 Q 1174 700 1174 682 L 1174 620" fill="none" stroke="#ececee" strokeWidth="1" />
      </svg>

      {/* 3-column spatial grid: [left floater] [center] [right floater] */}
      <div className="relative max-w-7xl mx-auto px-6 py-16 lg:py-20 grid lg:grid-cols-[220px_1fr_220px] gap-8 items-start">

        {/* ── LEFT FLOATER: Blind Bid Status ─────────────────────────── */}
        <motion.div
          className="hidden lg:block pt-20 sticky top-28"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="rounded-2xl bg-white border border-zinc-100 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.06)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <motion.span
                className="w-2 h-2 rounded-full bg-amber-400"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Blind Bid</span>
            </div>
            <div className="font-mono text-sm font-bold text-zinc-700 mb-3 tracking-tight">0x7c1b…????</div>
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400">
                <span>amount</span><span className="text-zinc-300">hidden</span>
              </div>
              <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-amber-300"
                  animate={{ width: ["35%", "60%", "35%"] }}
                  transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
            </div>
            <div className="text-[9px] font-mono text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1">COMMIT phase · active</div>
          </div>

          {/* Extra mini-card below */}
          <div className="mt-3 rounded-2xl bg-white border border-zinc-100 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.04)] p-3">
            <div className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-2">sui::random</div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
                <span className="text-[8px] font-bold text-violet-500">0x8</span>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-zinc-700">validator DKG</div>
                <div className="text-[9px] font-mono text-zinc-400">bias-proof randomness</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── CENTER COLUMN ───────────────────────────────────────────── */}
        <div className="flex flex-col items-center text-center min-w-0">

          {/* Eyebrow */}
          <motion.div
            className="flex items-center gap-2 mb-7"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <p className={`${EYEBROW} mb-0`}>Sealed-Bid · Fair-Launch · Sui Overflow 2026 · Testnet</p>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="font-bold text-zinc-900 tracking-tight leading-tight text-5xl sm:text-6xl lg:text-7xl mb-5 max-w-2xl"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          >
            Lose your device.{" "}
            <span className="text-zinc-400">Keep your bid.</span>
          </motion.h1>

          {/* Subhead */}
          <motion.p
            className="text-zinc-500 text-lg leading-relaxed max-w-xl mb-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.6 }}
          >
            One Google login, a blind bid only you can open. Lose this device and the bid lands on the next one — held on Walrus, locked by Seal.
          </motion.p>
          <motion.p
            className="text-zinc-400 text-sm mb-8 max-w-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.28, duration: 0.55 }}
          >
            No server, no FairDrop team, ever sees it. zkLogin re-derives your wallet on any device.
          </motion.p>

          {/* CTAs */}
          <motion.div
            className="flex flex-wrap justify-center gap-3 mb-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            <a href="#auction" className={BTN_PRIMARY}>Launch Live Auction →</a>
            {AUCTION_ID && (
              <a href={objUrl(AUCTION_ID)} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY}>
                Verify on Explorer <IExternal className="w-3.5 h-3.5" />
              </a>
            )}
          </motion.div>

          {/* Trust pills */}
          <motion.div
            className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.44, duration: 0.5 }}
          >
            {["Bids hidden until reveal", "Recover from any device", "No backend", "No admin key"].map((t) => (
              <span key={t} className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <ICheck className="w-3 h-3 text-emerald-500" /> {t}
              </span>
            ))}
          </motion.div>

          <div className="pb-12" />
        </div>

        {/* ── RIGHT FLOATER: Secured by Seal ─────────────────────────── */}
        <motion.div
          className="hidden lg:block pt-16 sticky top-24"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="rounded-2xl bg-white border border-zinc-100 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.06)] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Seal</span>
              <motion.span
                className="w-2 h-2 rounded-full bg-rose-400"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
            </div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-rose-400" aria-hidden>
                  <path d="M12 2L3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7L12 2z" />
                </svg>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-zinc-700">threshold t=2</div>
                <div className="text-[9px] font-mono text-zinc-400">seal_approve ✓</div>
              </div>
            </div>
            <div className="text-[9px] font-mono text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1">policy · Entry owner</div>
          </div>

          {/* Extra mini-card below */}
          <div className="mt-3 rounded-2xl bg-white border border-zinc-100 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.04)] p-3">
            <div className="text-[9px] font-mono text-zinc-400 uppercase tracking-widest mb-2">Walrus</div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-cyan-50 border border-cyan-100 flex items-center justify-center">
                <span className="text-[8px] font-bold text-cyan-500">W</span>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-zinc-700">blob stored</div>
                <div className="text-[9px] font-mono text-zinc-400">off-device backup</div>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function RecoverySection() {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="max-w-5xl mx-auto px-6 flex flex-col items-center text-center gap-10">
        {/* Eyebrow */}
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">Recovery Flow</span>
          <h2 className="text-3xl lg:text-5xl font-bold text-zinc-800 tracking-tight">
            Lose your device.<br className="hidden sm:block" /> Keep your bid.
          </h2>
          <p className="max-w-lg text-zinc-500 text-base leading-relaxed">
            Your encrypted nonce lives in Walrus. Your access policy lives on-chain.
            No server holds your keys — not even ours.
          </p>
        </motion.div>

        {/* Terminal card */}
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="rounded-[2rem] bg-white border border-zinc-100 shadow-[0_32px_80px_-16px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.03)] overflow-hidden">
            <div className="flex items-center gap-1.5 px-5 pt-4 pb-3 border-b border-zinc-50">
              <span className="w-2 h-2 rounded-full bg-zinc-100" />
              <span className="w-2 h-2 rounded-full bg-zinc-100" />
              <span className="w-2 h-2 rounded-full bg-zinc-100" />
              <span className="ml-3 text-[10px] font-mono text-zinc-400 tracking-[0.15em] uppercase">Recovery Flow · Live</span>
            </div>
            <div className="p-5">
              <RecoveryHero />
            </div>
          </div>
        </motion.div>

        {/* Proof line */}
        <motion.p
          className="text-xs text-zinc-400 font-mono tracking-widest uppercase"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          Walrus blob_id stored in Commitment on-chain · Seal policy: Entry owner only
        </motion.p>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="relative overflow-hidden py-20">
      <div className="absolute inset-0 pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className={EYEBROW}>The problem</motion.p>
          <motion.h2 variants={fadeUp} className={`${H2} mb-4`}>
            Every launch you&apos;ve seen was gameable.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 mb-12 max-w-xl leading-relaxed">
            It looks fair from the outside; the mechanics tell a different story — bots, whales, and insiders have structural advantages before the first bid is placed.
          </motion.p>

          <motion.div variants={stagger} className="grid sm:grid-cols-3 gap-4">
            {PROBLEMS.map((p) => (
              <motion.div key={p.title} variants={fadeUp}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`${CARD} p-6 flex flex-col cursor-default`}>
                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100/80 flex items-center justify-center mb-4">
                  <Icon d={p.icon} className="w-5 h-5 text-rose-400" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-700 mb-2">{p.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed flex-1">{p.body}</p>
                <div className="mt-4 pt-4 border-t border-black/[0.04]">
                  <p className="text-[11px] text-emerald-600 leading-relaxed">
                    <span className="font-semibold">FairDrop: </span>{p.fix}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function FairnessSection() {
  return (
    <section className="relative overflow-hidden py-20">
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className={EYEBROW}>Privacy · Fairness · Verifiability</motion.p>
          <motion.h2 variants={fadeUp} className={`${H2} mb-12`}>
            Private bids, a fair draw, verifiable settlement.
          </motion.h2>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-4">
            {FAIRNESS.map((f) => (
              <motion.div key={f.title} variants={fadeUp}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`${CARD} p-6 cursor-default`}>
                <div className="mb-4 min-h-[28px] flex items-center">{f.visual}</div>
                <h3 className={`text-base font-semibold ${f.accent} mb-2`}>{f.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">{f.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <section id="how" className="relative overflow-hidden py-20">
      <div className="absolute inset-0 pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className={EYEBROW}>Auction lifecycle</motion.p>
          <motion.h2 variants={fadeUp} className={`${H2} mb-2`}>
            Five steps. No trust required.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-400 text-sm mb-10">Click any step to expand.</motion.p>

          <motion.div variants={stagger} className={`${CARD} overflow-hidden divide-y divide-black/[0.04]`}>
            {STEPS.map((step, i) => (
              <motion.div key={step.num} variants={fadeUp}
                onClick={() => setActive(active === i ? null : i)}
                className={`group flex gap-5 p-5 sm:p-6 cursor-pointer select-none transition-all duration-200 ${
                  active === i ? "bg-zinc-50/70" : "hover:bg-zinc-50/50"
                }`}>
                <span className={`font-mono text-2xl font-bold flex-shrink-0 leading-none w-10 transition-colors duration-200 ${active === i ? "text-blue-500" : "text-zinc-200"}`}>{step.num}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold transition-colors duration-200 ${active === i ? "text-zinc-900" : "text-zinc-600 group-hover:text-zinc-800"}`}>{step.label}</p>
                  <AnimatePresence initial={false}>
                    {active === i && (
                      <motion.p
                        key="desc"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22 }}
                        className="text-xs text-zinc-400 leading-relaxed mt-2"
                      >
                        {step.desc}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <motion.span
                  animate={{ rotate: active === i ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex-shrink-0 mt-0.5 transition-colors ${active === i ? "text-blue-500" : "text-zinc-300 group-hover:text-zinc-400"}`}
                ><IChevron className="w-4 h-4" /></motion.span>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function WhySuiSection() {
  return (
    <section id="why-sui" className="relative overflow-hidden py-20">
      <div className="absolute inset-0 pointer-events-none" />
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className={EYEBROW}>Powered by</motion.p>
          <motion.h2 variants={fadeUp} className={`${H2} mb-4`}>
            Built entirely from Sui-native primitives.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 mb-12 max-w-xl leading-relaxed">
            No bridges. No oracles from other chains. Every fairness guarantee is enforced by Sui&apos;s own infrastructure.
          </motion.p>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PRIMITIVES.map((p) => (
              <motion.div key={p.name} variants={fadeUp}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className={`${CARD_SM} p-5 cursor-default`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                  <span className={`text-sm font-bold ${p.color} font-mono`}>{p.name}</span>
                  <span className="ml-auto text-[10px] text-zinc-400">by {p.by}</span>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function VerifiabilitySection() {
  return (
    <section className="relative overflow-hidden py-20">
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className={EYEBROW}>Verifiability</motion.p>
          <motion.h2 variants={fadeUp} className={`${H2} mb-4`}>
            Don&apos;t trust us. Verify it yourself.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 mb-8 max-w-xl leading-relaxed">
            Every object, transaction, and state change is on-chain. Open the live objects below on SuiScan and trace any auction&apos;s artifacts straight from its history.
          </motion.p>

          <motion.div variants={stagger} className="flex flex-wrap gap-2 mb-8">
            {[
              { label: "Google-gated entry", color: "text-blue-600 bg-blue-50 border-blue-100" },
              { label: "No backend", color: "text-emerald-700 bg-emerald-50 border-emerald-100" },
              { label: "No admin key", color: "text-emerald-700 bg-emerald-50 border-emerald-100" },
              { label: "One PTB settlement", color: "text-blue-600 bg-blue-50 border-blue-100" },
              { label: "sui::random DKG", color: "text-violet-700 bg-violet-50 border-violet-100" },
              { label: "100% on-chain state", color: "text-cyan-700 bg-cyan-50 border-cyan-100" },
            ].map((item) => (
              <motion.span key={item.label} variants={fadeUp}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${item.color}`}>
                <ICheck className="w-3 h-3" /> {item.label}
              </motion.span>
            ))}
          </motion.div>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-3 mb-4">
            {RECEIPTS.filter((r) => r.id).map((r) => (
              <motion.a key={r.label} variants={fadeUp}
                href={objUrl(r.id!)} target="_blank" rel="noopener noreferrer"
                whileHover={{ y: -2, transition: { duration: 0.15 } }}
                className={`group flex items-center justify-between ${CARD_SM} p-5 hover:shadow-[0_16px_40px_-8px_rgba(0,0,0,0.08)] transition-all duration-300`}>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-800 font-medium group-hover:text-blue-600 transition-colors">{r.label}</p>
                  <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{r.id!.slice(0, 20)}…</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">{r.hint}</p>
                </div>
                <span className="text-zinc-300 group-hover:text-blue-500 transition-colors text-lg flex-shrink-0 ml-4">↗</span>
              </motion.a>
            ))}
          </motion.div>

          <motion.div variants={fadeUp} className={`${CARD_SM} p-5`}>
            <p className={`${EYEBROW} mb-3`}>Trace any auction</p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px]">
              {[
                { k: "Commitment", v: "hash only — no amount on-chain until reveal", c: "text-amber-500" },
                { k: "BidRevealed event", v: "amount appears here, in the reveal tx", c: "text-amber-500" },
                { k: "Resolve tx", v: "consumes 0x8 — selects winners via DKG randomness", c: "text-blue-500" },
                { k: "WinnerCertificate", v: "minted on-chain to each winner", c: "text-emerald-500" },
              ].map((a) => (
                <div key={a.k} className="flex items-baseline gap-2">
                  <span className={`${a.c} flex-shrink-0`}>{a.k}</span>
                  <span className="text-zinc-400">{a.v}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function FooterSection() {
  return (
    <footer className="border-t border-black/[0.05] py-12 bg-white/50">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between gap-8 text-xs text-zinc-500">
        <div>
          <p className="text-zinc-800 font-semibold text-sm mb-1">FairDrop</p>
          <p className="mb-1">Fair launch protocol · Sui Overflow 2026</p>
          {PACKAGE_ID && (
            <a href={objUrl(PACKAGE_ID)} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[10px] text-zinc-400 hover:text-zinc-600 transition-colors">
              {PACKAGE_ID.slice(0, 22)}… ↗
            </a>
          )}
        </div>
        <div>
          <p className="text-zinc-500 mb-2">Sui-native primitives</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-zinc-400">
            {["zkLogin", "sui::random", "Seal", "Walrus", "Enoki", "Pyth"].map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <main className="min-h-screen bg-[#FAFAFA]">
      <NavBar />
      <HeroSection />
      <RecoverySection />
      <ProblemSection />
      <FairnessSection />
      <HowItWorksSection />
      <ArchitectureFlow />
      <WhySuiSection />
      <VerifiabilitySection />

      {/* Live Auction */}
      <section id="auction" className="relative overflow-hidden py-20">
        <div className="absolute inset-0 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-10">
            <motion.p variants={fadeUp} className={EYEBROW}>Live on testnet</motion.p>
            <motion.h2 variants={fadeUp} className={`${H2} mb-2`}>
              Participate in a live auction.
            </motion.h2>
            <motion.p variants={fadeUp} className="text-zinc-500 text-sm">
              All state is on-chain. Every action is verifiable. No server involved.
            </motion.p>
          </motion.div>
          <LiveAuction />
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden py-28">
        <div className="absolute inset-0 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 text-center">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <motion.h2 variants={fadeUp} className="text-4xl lg:text-6xl font-bold text-zinc-900 mb-6 tracking-tight leading-tight">
              Lose your device.{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-violet-500">
                Keep your bid.
              </span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-zinc-500 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
              Blind bids, a verifiable draw, atomic settlement — and a sealed bid you can recover from
              any device. No backend, no admin key, no trust beyond the Sui protocol itself.
            </motion.p>
            <motion.div variants={fadeUp} className="flex justify-center gap-4 flex-wrap">
              <a href="#auction" className={BTN_PRIMARY}>
                Launch Live Auction →
              </a>
              {PACKAGE_ID && (
                <a href={objUrl(PACKAGE_ID)} target="_blank" rel="noopener noreferrer" className={BTN_SECONDARY}>
                  Read the Contract ↗
                </a>
              )}
            </motion.div>
          </motion.div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
