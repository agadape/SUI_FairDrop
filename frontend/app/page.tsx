"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ConnectButton } from "@mysten/dapp-kit";
import { LiveAuction } from "@/app/components/LiveAuction";
import { RecoveryHero } from "@/app/components/RecoveryHero";
import { PACKAGE_ID, AUCTION_ID, RANDOM_ID, NETWORK } from "@/lib/constants";

// ─── Icons (shared stroke language with the terminals — zero emoji) ────────────

function Icon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICheck = (p: { className?: string }) => <Icon className={p.className} d="M20 6 9 17l-5-5" />;
const IExternal = (p: { className?: string }) => <Icon className={p.className} d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />;
const IArrowDown = (p: { className?: string }) => <Icon className={p.className} d="M12 5v14m-6-6 6 6 6-6" />;
const IChevron = (p: { className?: string }) => <Icon className={p.className} d="M9 6l6 6-6 6" />;
const IBolt = (p: { className?: string }) => <Icon className={p.className} d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />;
// Problem-card glyphs
const PATH_BOT = "M12 8V4H8M4 8h16v12H4zM2 14h2m16 0h2M9 13v2m6-2v2";
const PATH_EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
const PATH_DICE = "M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01";

// ─── Explorer helpers ─────────────────────────────────────────────────────────

const SUISCAN = `https://suiscan.xyz/${NETWORK}`;
const objUrl = (id: string) => `${SUISCAN}/object/${id}`;

// ─── Motion variants ──────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.13 } },
};

// ─── Protocol flow data ───────────────────────────────────────────────────────

// (FLOW_STEPS hero visual removed — replaced by RecoveryHero; the auction
// lifecycle is documented by STEPS in the How-it-works section.)

// ─── Problem data ─────────────────────────────────────────────────────────────

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

// ─── Fairness cards ───────────────────────────────────────────────────────────

const FAIRNESS = [
  {
    title: "Google-Gated Entry",
    body: "OAuth-gated entry, raising Sybil attack costs. A Google login is required to register, and each address registers exactly once — a per-registration nullifier is committed on-chain via sha3_256. This makes multi-wallet farming expensive. Not proof-of-personhood.",
    border: "border-blue-500/25", glow: "rgba(59,130,246,0.1)", accent: "text-blue-600",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded text-[10px]">Wallet addr</span>
        <span className="text-zinc-700">→</span>
        <span className="text-blue-600 text-[10px]">sha3_256</span>
        <span className="text-zinc-700">→</span>
        <span className="text-blue-300 text-[10px] bg-white px-1.5 py-0.5 rounded border border-blue-500/20">0x4f2a…</span>
      </div>
    ),
  },
  {
    title: "Hidden Bids",
    body: "sha3_256(amount ‖ nonce) committed on-chain before any amount is visible. No MEV. No last-second sniping. Amount unknowable until reveal.",
    border: "border-amber-500/25", glow: "rgba(245,158,11,0.1)", accent: "text-amber-400",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-amber-300 bg-white px-2 py-0.5 rounded border border-amber-500/20 text-[10px]">5.0 SUI</span>
        <span className="text-zinc-700">→</span>
        <span className="text-amber-500 text-[10px]">sha3_256</span>
        <span className="text-zinc-700">→</span>
        <span className="text-zinc-600 text-[10px] tracking-wider">0x7c1b…????</span>
      </div>
    ),
  },
  {
    title: "Verifiable Randomness",
    body: "Ties broken by sui::random at 0x8, backed by Sui's validator distributed key generation. The outcome is on-chain, permanent, and inspectable by anyone.",
    border: "border-violet-500/25", glow: "rgba(139,92,246,0.12)", accent: "text-violet-700",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-zinc-600 text-[10px]">validator DKG</span>
        <span className="text-zinc-700">→</span>
        <span className="text-violet-700 font-bold px-2 py-0.5 rounded bg-white border border-violet-500/30">0x8</span>
        <span className="text-zinc-700">→</span>
        <span className="text-violet-300 text-[10px]">winner ✓</span>
      </div>
    ),
  },
  {
    title: "Trustless Settlement",
    body: "Trustless pull-settlement pattern: winners claim, losers reclaim, the creator withdraws — each a permissionless on-chain call. No admin can seize or block funds, and no batch failure can strand anyone. The contract holds no override key.",
    border: "border-emerald-500/25", glow: "rgba(16,185,129,0.1)", accent: "text-emerald-700",
    visual: (
      <div className="font-mono text-[10px] space-y-1">
        <div className="text-emerald-700">✓ winners → allocation + escrow change</div>
        <div className="text-zinc-500">↩ losers → full escrow refund</div>
        <div className="text-zinc-600">→ creator → proceeds</div>
      </div>
    ),
  },
];

// ─── How it works ─────────────────────────────────────────────────────────────

const STEPS = [
  { num: "01", label: "Register with Google", desc: "OAuth-gated entry, raising Sybil attack costs. A Google login is required to register, and each address registers exactly once: a per-registration nullifier is committed on-chain, and a second registration from the same address or nullifier is rejected. This raises the cost of multi-wallet farming — not proof-of-personhood." },
  { num: "02", label: "Seal your bid", desc: "You choose an amount and submit sha3_256(amount ‖ nonce). The hash commits you to the bid without revealing it. Miners, validators, and every other bidder see only a 32-byte hash until reveal. Front-running requires seeing the bid. You made that impossible." },
  { num: "03", label: "Reveal when the phase opens", desc: "After the commit window closes, you send your actual amount and nonce. The contract recomputes the hash and verifies it matches exactly. Reveal a different amount: rejected. Reveal late: rejected. No flexibility, by design." },
  { num: "04", label: "Anyone calls resolve", desc: "No admin required. Anyone calls resolve and the contract does the work: sort bids, find the clearing price, break ties using sui::random at 0x8. Validator DKG randomness — no single party can predict or bias it. The outcome is on-chain and permanent." },
  { num: "05", label: "Settle, then claim", desc: "resolve runs once: it sorts bids, finds the clearing price, breaks ties with sui::random, and mints a WinnerCertificate to every winner — all in one PTB. Settlement is then pull-based: winners claim (pay the clearing price, take their change), losers reclaim their full escrow, the creator withdraws proceeds. Each is a separate permissionless call. No admin can seize or block funds; no failed batch can strand anyone." },
];

// ─── Sui primitives ───────────────────────────────────────────────────────────

const PRIMITIVES = [
  { name: "Seal", by: "Kostas Chalkias", desc: "Threshold-encrypts your reveal secret. An on-chain Move policy (seal_approve) releases it only to you, only during reveal — no FairDrop server can decrypt it.", color: "text-pink-400", border: "border-pink-500/20", bg: "bg-pink-950/20" },
  { name: "Walrus", by: "Mysten Labs", desc: "Decentralized blob storage for the encrypted secret. Recoverable from any device — no backend, no team custody.", color: "text-cyan-700", border: "border-cyan-500/20", bg: "bg-white" },
  { name: "zkLogin", by: "Deepak Maram", desc: "Google login instead of a wallet — the same login re-derives the same wallet on any device. Raises Sybil cost; not proof-of-personhood.", color: "text-blue-600", border: "border-blue-500/20", bg: "bg-white" },
  { name: "sui::random", by: "Andrew Schran", desc: "Validator DKG randomness at object 0x8. Unpredictable before the transaction. Unbiasable by any party.", color: "text-violet-700", border: "border-violet-500/20", bg: "bg-white" },
  { name: "Enoki", by: "Mysten Labs", desc: "The zkLogin auth flow behind the Google button — onboards users with no seed phrase and no extension. Gas is self-paid on testnet (no sponsorship).", color: "text-orange-400", border: "border-orange-500/20", bg: "bg-orange-950/20" },
  { name: "PTBs", by: "Sui protocol", desc: "Programmable Transaction Blocks compose many Move calls into one atomic transaction — resolve mints every WinnerCertificate in a single PTB. Final settlement is pull-based (claim, reclaim, withdraw), so no party can be stranded by another's failure.", color: "text-emerald-700", border: "border-emerald-500/20", bg: "bg-white" },
];

// ─── Explorer receipts ────────────────────────────────────────────────────────

const RECEIPTS = [
  { label: "Package contract", id: PACKAGE_ID, hint: "auction + seal_policy Move source · immutable" },
  { label: "Live auction object", id: AUCTION_ID, hint: "commitments, reveals & winners tables · live state" },
  { label: "sui::random (0x8)", id: RANDOM_ID, hint: "validator DKG · consumed in every resolve tx" },
  { label: "Clock (0x6)", id: "0x6", hint: "timestamp source for phase gating" },
];

// ─── Components ───────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-zinc-900 font-bold text-lg tracking-tight">FairDrop</span>
          <span className="hidden sm:block text-[10px] text-zinc-500 font-mono border border-zinc-300 rounded-full px-2 py-0.5">
            Sui Overflow 2026
          </span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#how" className="text-xs text-zinc-600 hover:text-zinc-900 transition-colors hidden md:block">How it works</a>
          <a href="#why-sui" className="text-xs text-zinc-600 hover:text-zinc-900 transition-colors hidden md:block">Why Sui</a>
          <a href="#auction" className="text-xs text-zinc-600 hover:text-zinc-900 transition-colors hidden md:block">Live auction</a>
          <a href="/umbra" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors border border-blue-300 rounded-full px-2.5 py-1"><IBolt className="w-3.5 h-3.5" /> Umbra</a>
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-16 pb-24 lg:pt-24 lg:pb-32">
      {/* Background ambient glows */}

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left — copy */}
          <div className="space-y-7">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
              <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-5">
                Sealed-Bid Fair-Launch Auction · Sui Overflow 2026 · Testnet
              </p>
              <h1 className="text-5xl lg:text-[3.75rem] font-bold tracking-tight leading-[1.05] text-zinc-900">
                Lose your device.
                <br />
                <span className="text-blue-600">
                  Keep your bid.
                </span>
              </h1>
            </motion.div>

            <motion.p
              className="text-zinc-400 text-lg leading-relaxed max-w-md"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.55 }}
            >
              One Google login, a blind bid only you can open. Lose this device and the bid lands
              on the next one — held on Walrus, locked by Seal. No server, no FairDrop team, ever sees it.
            </motion.p>

            <motion.p
              className="text-zinc-600 text-xs max-w-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.55 }}
            >
              zkLogin re-derives the same wallet on any device. Raises Sybil cost — not Sybil-proof.
            </motion.p>

            <motion.div
              className="flex flex-wrap gap-3"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.55 }}
            >
              <a href="#auction"
                className="px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-none transition active:scale-[0.98]">
                Launch Live Auction →
              </a>
              {AUCTION_ID && (
                <a href={objUrl(AUCTION_ID)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-900 text-sm font-semibold rounded-none transition active:scale-[0.98]">
                  Verify on Explorer <IExternal className="w-3.5 h-3.5" />
                </a>
              )}
            </motion.div>

            <motion.div
              className="flex flex-wrap gap-x-4 gap-y-1 pt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7, duration: 0.6 }}
            >
              {[
                "Bids hidden until reveal",
                "Recover from any device",
                "No backend",
                "No admin key",
              ].map((t) => (
                <span key={t} className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                  <ICheck className="w-3 h-3 text-emerald-700" /> {t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Right — recovery handoff */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6 }}
            className="mx-auto lg:mx-0 w-full"
          >
            <RecoveryHero />
            <a
              href="#auction"
              className="group mt-4 flex items-center justify-center gap-2 border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-white/[0.06]"
            >
              Try it on a live bid
              <span className="transition-transform group-hover:translate-y-0.5"><IArrowDown className="w-4 h-4" /></span>
            </a>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="py-20 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
            The problem
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-zinc-900 mb-3">
            Every launch you&apos;ve seen was gameable.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 mb-12 max-w-xl leading-relaxed">
            Recovering your bid is the safety net. But a bid that survives still has to stay private and be allocated fairly — and that is exactly where most launches break. It looks fair from the outside; the mechanics tell a different story, one where bots, whales, and insiders have structural advantages before the first bid is placed.
          </motion.p>

          <motion.div variants={stagger} className="grid sm:grid-cols-3 gap-4">
            {PROBLEMS.map((p) => (
              <motion.div key={p.title} variants={fadeUp}
                whileHover={{ scale: 1.015 }}
                className="p-5 rounded-none border border-rose-500/10 bg-white hover:border-white/30 transition-all cursor-default flex flex-col">
                <div className="w-9 h-9 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] flex items-center justify-center mb-3">
                  <Icon d={p.icon} className="w-5 h-5 text-rose-400" />
                </div>
                <h3 className="text-sm font-semibold text-rose-600 mb-2">{p.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed flex-1">{p.body}</p>
                <div className="mt-3 pt-3 border-t border-emerald-500/10">
                  <p className="text-[11px] text-emerald-700 leading-relaxed">
                    <span className="text-emerald-700 font-semibold">FairDrop: </span>{p.fix}
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
    <section className="py-20 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
            Privacy · Fairness · Verifiability
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-zinc-900 mb-12">
            Private bids, a fair draw, verifiable settlement.
          </motion.h2>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-4">
            {FAIRNESS.map((f) => (
              <motion.div key={f.title} variants={fadeUp}
                whileHover={{ scale: 1.012 }}
                className={`p-6 border ${f.border} bg-white transition-all cursor-default`}>
                <div className="mb-4 min-h-[28px] flex items-center">{f.visual}</div>
                <h3 className={`text-base font-bold ${f.accent} mb-2`}>{f.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{f.body}</p>
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
    <section id="how" className="py-20 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
            Auction lifecycle
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-zinc-900 mb-2">
            Five steps. No trust required.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-600 text-xs mb-10">
            Click any step to expand.
          </motion.p>

          <motion.div variants={stagger} className="space-y-2">
            {STEPS.map((step, i) => (
              <motion.div key={step.num} variants={fadeUp}
                onClick={() => setActive(active === i ? null : i)}
                className={`group flex gap-5 p-5 rounded-none border transition-all cursor-pointer select-none ${
                  active === i
                    ? "border-emerald-500/30 bg-white"
                    : "border-zinc-200 hover:border-zinc-200 bg-zinc-50 hover:bg-white/[0.03]"
                }`}>
                <span className={`font-mono text-sm font-bold flex-shrink-0 mt-0.5 w-8 transition-colors ${active === i ? "text-emerald-700" : "text-zinc-700"}`}>{step.num}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold transition-colors ${active === i ? "text-zinc-900" : "text-zinc-700 group-hover:text-zinc-900"}`}>{step.label}</p>
                  <AnimatePresence initial={false}>
                    {active === i && (
                      <motion.p
                        key="desc"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="text-xs text-zinc-400 leading-relaxed mt-2"
                      >
                        {step.desc}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <motion.span
                  animate={{ rotate: active === i ? 90 : 0 }}
                  transition={{ duration: 0.18 }}
                  className={`flex-shrink-0 mt-1 transition-colors ${active === i ? "text-emerald-700" : "text-zinc-700 group-hover:text-zinc-500"}`}
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
    <section id="why-sui" className="py-20 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
            Powered by
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-zinc-900 mb-4">
            Built entirely from Sui-native primitives.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 mb-12 max-w-xl leading-relaxed">
            No bridges. No oracles from other chains. Every fairness guarantee is enforced by Sui&apos;s own infrastructure.
          </motion.p>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRIMITIVES.map((p) => (
              <motion.div key={p.name} variants={fadeUp}
                whileHover={{ scale: 1.018 }}
                className={`p-4 rounded-none border ${p.border} ${p.bg} transition-all cursor-default`}>
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-sm font-bold ${p.color} font-mono`}>{p.name}</span>
                  <span className="text-[9px] text-zinc-700 mt-0.5">by {p.by}</span>
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
    <section className="py-20 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
            Verifiability
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-zinc-900 mb-4">
            Don&apos;t trust us. Verify it yourself.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 mb-8 max-w-xl leading-relaxed">
            Every object, transaction, and state change is on-chain. Open the live objects below on SuiScan, then trace any auction&apos;s artifacts — commitments, reveals, the resolve transaction, and winner certificates — straight from its history.
          </motion.p>

          <motion.div variants={stagger} className="flex flex-wrap gap-3 mb-10">
            {[
              { label: "Google-gated entry", color: "text-blue-600 border-blue-500/20 bg-white" },
              { label: "No backend", color: "text-emerald-700 border-emerald-500/20 bg-white" },
              { label: "No admin key", color: "text-emerald-700 border-emerald-500/20 bg-white" },
              { label: "One PTB settlement", color: "text-blue-600 border-blue-500/20 bg-white" },
              { label: "sui::random DKG", color: "text-blue-600 border-blue-500/20 bg-white" },
              { label: "100% on-chain state", color: "text-cyan-700 border-cyan-500/20 bg-white" },
            ].map((item) => (
              <motion.span key={item.label} variants={fadeUp}
                className={`text-xs font-mono px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${item.color}`}>
                <ICheck className="w-3 h-3" /> {item.label}
              </motion.span>
            ))}
          </motion.div>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-3">
            {RECEIPTS.filter((r) => r.id).map((r) => (
              <motion.a key={r.label} variants={fadeUp}
                href={objUrl(r.id!)} target="_blank" rel="noopener noreferrer"
                whileHover={{ scale: 1.012 }}
                className="group flex items-center justify-between p-4 rounded-none border border-zinc-200 bg-zinc-50 hover:border-emerald-500/25 hover:bg-zinc-100 transition-all">
                <div className="min-w-0">
                  <p className="text-sm text-zinc-900 font-medium group-hover:text-emerald-300 transition-colors">{r.label}</p>
                  <p className="text-[10px] text-zinc-700 font-mono mt-0.5">{r.id!.slice(0, 20)}…</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{r.hint}</p>
                </div>
                <span className="text-zinc-700 group-hover:text-emerald-700 transition-colors text-lg flex-shrink-0 ml-4">↗</span>
              </motion.a>
            ))}
          </motion.div>

          {/* Lifecycle artifacts — what to look for on a live auction */}
          <motion.div variants={fadeUp} className="mt-4 rounded-none border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">Trace any auction</p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px]">
              {[
                { k: "Commitment", v: "hash only — no amount on-chain until reveal", c: "text-amber-400" },
                { k: "BidRevealed event", v: "amount appears here, in the reveal tx", c: "text-amber-300" },
                { k: "Resolve tx", v: "consumes 0x8 — selects winners via DKG randomness", c: "text-blue-600" },
                { k: "WinnerCertificate", v: "minted on-chain to each winner", c: "text-emerald-700" },
              ].map((a) => (
                <div key={a.k} className="flex items-baseline gap-2">
                  <span className={`${a.c} flex-shrink-0`}>{a.k}</span>
                  <span className="text-zinc-600">{a.v}</span>
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
    <footer className="border-t border-zinc-200 py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between gap-8 text-xs text-zinc-600">
        <div>
          <p className="text-zinc-900 font-bold text-sm mb-1">FairDrop</p>
          <p className="mb-1">Fair launch protocol · Sui Overflow 2026</p>
          {PACKAGE_ID && (
            <a href={objUrl(PACKAGE_ID)} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[10px] hover:text-zinc-400 transition-colors">
              {PACKAGE_ID.slice(0, 22)}… ↗
            </a>
          )}
        </div>
        <div>
          <p className="text-zinc-700 mb-2">Sui-native primitives</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px]">
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
    <main className="min-h-screen bg-white">
      <NavBar />
      <HeroSection />
      <ProblemSection />
      <FairnessSection />
      <HowItWorksSection />
      <WhySuiSection />
      <VerifiabilitySection />

      {/* Live Auction */}
      <section id="auction" className="py-20 border-t border-zinc-200">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-10">
            <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
              Live on testnet
            </motion.p>
            <motion.h2 variants={fadeUp} className="text-3xl font-bold text-zinc-900 mb-2">
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
      <section className="py-28 border-t border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <motion.h2 variants={fadeUp} className="text-4xl lg:text-5xl font-bold text-zinc-900 mb-6 leading-tight text-balance">
              Lose your device.
              {" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 to-blue-400">
                Keep your bid.
              </span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-zinc-400 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
              Blind bids, a verifiable draw, atomic settlement — and a sealed bid you can recover from
              any device. No backend, no admin key, no trust beyond the Sui protocol itself.
            </motion.p>
            <motion.div variants={fadeUp} className="flex justify-center gap-4 flex-wrap">
              <a href="#auction"
                className="px-7 py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-none transition active:scale-[0.98]">
                Launch Live Auction →
              </a>
              {PACKAGE_ID && (
                <a href={objUrl(PACKAGE_ID)} target="_blank" rel="noopener noreferrer"
                  className="px-7 py-3.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-900 text-sm font-semibold rounded-none transition-colors">
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
