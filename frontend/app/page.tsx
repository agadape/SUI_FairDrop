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
const IArrowRight = (p: { className?: string }) => <Icon className={p.className} d="M5 12h14M13 6l6 6-6 6" />;
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-10 lg:pt-6 lg:pb-14 grid lg:grid-cols-[1.85fr_1fr] gap-4 lg:gap-5 items-stretch">

        {/* ── LEFT: big light "stage" card ─────────────────────────────── */}
        <motion.div
          className="relative overflow-hidden rounded-[2.25rem] sm:rounded-[2.5rem] bg-white border border-black/[0.04] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.06)] p-7 sm:p-10 lg:p-12 min-h-[480px] lg:min-h-[560px] flex flex-col"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* badge pill */}
          <motion.a
            href="#auction"
            className="group inline-flex items-center gap-2 self-start rounded-full border border-amber-300/70 bg-amber-50 pl-3 pr-1.5 py-1 text-[11px] font-semibold text-amber-700"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
            </span>
            Live on testnet · sealed-bid auction open
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white transition-transform duration-300 group-hover:translate-x-0.5">
              <IArrowRight className="w-3 h-3" />
            </span>
          </motion.a>

          {/* headline — ink */}
          <motion.h1
            className="relative z-10 mt-7 font-bold tracking-[-0.03em] leading-[0.98] text-[2.6rem] sm:text-6xl lg:text-7xl max-w-[16ch]"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-zinc-900 to-zinc-700">Lose your device.</span>{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-zinc-500 to-zinc-400">Keep your bid.</span>
          </motion.h1>

          {/* subhead */}
          <motion.p
            className="relative z-10 mt-5 max-w-md text-zinc-500 text-base leading-relaxed"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.6 }}
          >
            One Google login, a blind bid only you can open — held on Walrus, locked by Seal.
            No server, no FairDrop team, ever sees it.
          </motion.p>

          {/* CTA */}
          <motion.div
            className="relative z-10 mt-7 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.34, duration: 0.5 }}
          >
            <a href="#auction" className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-6 py-3 text-sm font-semibold text-white hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 active:scale-[0.98]">
              Launch live auction <IArrowRight className="w-4 h-4" />
            </a>
            {AUCTION_ID && (
              <a href={objUrl(AUCTION_ID)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                Verify on Explorer <IExternal className="w-3.5 h-3.5" />
              </a>
            )}
          </motion.div>

          <div className="flex-1" />

          {/* trust row */}
          <motion.div
            className="relative z-10 flex flex-wrap gap-x-4 gap-y-1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            {["Bids hidden until reveal", "Recover from any device", "No backend"].map((t) => (
              <span key={t} className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                <ICheck className="w-3 h-3 text-emerald-500" /> {t}
              </span>
            ))}
          </motion.div>

          {/* illustration — fills the empty right column (headline is left-aligned) */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute bottom-2 -right-[5%] z-0 hidden sm:block h-[70%] w-[50%] lg:h-[80%] lg:w-[53%] bg-[url('/illustrations/mobile-encryption.svg')] bg-contain bg-right-bottom bg-no-repeat opacity-90"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 0.9, scale: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          />
        </motion.div>

        {/* ── RIGHT: two stacked accent cards ──────────────────────────── */}
        <div className="flex flex-col gap-4 lg:gap-5">

          {/* TOP — bold accent CTA card with rising chart */}
          <motion.a
            href="#auction"
            className="group relative flex flex-1 flex-col justify-between overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#ff5a2c] to-[#ff7a45] p-7 text-white min-h-[260px]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="relative z-10 text-2xl font-bold leading-tight tracking-tight">
              Enter the<br />sealed-bid auction
            </h2>

            {/* rising line chart — clean white line, round nodes, pulsing peak */}
            <div className="relative z-10 mt-2 h-28">
              <span className="absolute right-9 top-1 z-10 rounded-full bg-yellow-300 px-2.5 py-0.5 text-[11px] font-bold text-zinc-900">live</span>
              <svg viewBox="0 0 340 112" className="h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
                {/* the line */}
                <motion.polyline
                  points="10,86 120,66 226,74 330,24"
                  fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                  transition={{ delay: 0.6, duration: 1.2, ease: "easeOut" }}
                />
                {/* node dots */}
                {[[120, 66], [226, 74]].map(([cx, cy]) => (
                  <motion.circle key={`cn${cx}`} cx={cx} cy={cy} r="4" fill="white" stroke="#ff5a2c" strokeWidth="2"
                    initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.3, duration: 0.4, ease: "backOut" }} />
                ))}
                {/* pulsing peak */}
                <motion.circle cx="330" cy="24" r="10" fill="white"
                  animate={{ r: [8, 13, 8], opacity: [0.35, 0.08, 0.35] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }} />
                <circle cx="330" cy="24" r="5" fill="white" />
              </svg>
            </div>
          </motion.a>

          {/* BOTTOM — black recovery card with primitive chips */}
          <motion.div
            className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-[2rem] bg-zinc-950 p-7 text-white min-h-[230px]"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-2xl font-bold leading-tight tracking-tight">
              Recover from<br />any device
            </h2>

            {/* recovery rail — the real flow, in miniature */}
            <div className="space-y-2">
              {[
                { dot: "bg-zinc-500", label: "Device lost", note: "localStorage gone" },
                { dot: "bg-cyan-400", label: "Walrus", note: "encrypted blob fetched" },
                { dot: "bg-rose-400", label: "Seal", note: "policy approved" },
                { dot: "bg-emerald-400", label: "Bid restored", note: "same wallet · zkLogin" },
              ].map((s, i, arr) => (
                <div key={s.label} className="flex items-center gap-2.5">
                  <span className="relative flex flex-col items-center">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {i < arr.length - 1 && <span className="absolute top-1.5 h-3.5 w-px bg-white/10" />}
                  </span>
                  <span className="text-[12px] font-semibold text-zinc-100">{s.label}</span>
                  <span className="text-[11px] font-mono text-zinc-500">{s.note}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {[
                  { label: "W", ring: "bg-cyan-500/20 border-cyan-400/40 text-cyan-300" },
                  { label: "S", ring: "bg-rose-500/20 border-rose-400/40 text-rose-300" },
                  { label: "zk", ring: "bg-blue-500/20 border-blue-400/40 text-blue-300" },
                ].map((c) => (
                  <span key={c.label} className={`flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-bold font-mono ${c.ring} ring-2 ring-zinc-950`}>
                    {c.label}
                  </span>
                ))}
              </div>
              <span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-zinc-300">
                Walrus · Seal · zkLogin
              </span>
            </div>
          </motion.div>
        </div>

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
    <main className="min-h-screen bg-zinc-100">
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
