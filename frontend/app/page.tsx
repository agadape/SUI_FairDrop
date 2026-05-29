"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ConnectButton } from "@mysten/dapp-kit";
import { LiveAuction } from "@/app/components/LiveAuction";
import { RecoveryHero } from "@/app/components/RecoveryHero";
import { PACKAGE_ID, AUCTION_ID, RANDOM_ID, NETWORK } from "@/lib/constants";

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
    icon: "🤖",
    title: "Bots steal allocations",
    body: "Bots watch the mempool and submit higher bids in the same block. Public bids are weapons for front-running.",
    fix: "Blind bids — no amount on-chain until reveal. Nothing to front-run.",
  },
  {
    icon: "👁",
    title: "Whales see your bid",
    body: "In public auctions, large holders watch submissions and shade their bid above yours at the last second.",
    fix: "Every bid is a hash until reveal phase. Whales can't see, can't shade.",
  },
  {
    icon: "🎲",
    title: "Nobody verifies the draw",
    body: "The organizer controls winner selection. \"Random\" just means they said so. No proof exists.",
    fix: "sui::random at 0x8 — validator DKG. On-chain. Auditable forever.",
  },
];

// ─── Fairness cards ───────────────────────────────────────────────────────────

const FAIRNESS = [
  {
    title: "Google-Gated Entry",
    body: "zkLogin gates each entry behind a Google login, with a per-registration nullifier committed on-chain via sha3_256. This raises the cost of multi-wallet farming — it is not proof-of-personhood.",
    border: "border-blue-500/25", glow: "rgba(59,130,246,0.1)", accent: "text-blue-400",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded text-[10px]">Google sub</span>
        <span className="text-zinc-700">→</span>
        <span className="text-blue-500 text-[10px]">sha3_256</span>
        <span className="text-zinc-700">→</span>
        <span className="text-blue-300 text-[10px] bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-500/20">0x4f2a…</span>
      </div>
    ),
  },
  {
    title: "Hidden Bids",
    body: "sha3_256(amount ‖ nonce) committed on-chain before any amount is visible. No MEV. No last-second sniping. Amount unknowable until reveal.",
    border: "border-amber-500/25", glow: "rgba(245,158,11,0.1)", accent: "text-amber-400",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/20 text-[10px]">5.0 SUI</span>
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
    border: "border-violet-500/25", glow: "rgba(139,92,246,0.12)", accent: "text-violet-400",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-zinc-600 text-[10px]">validator DKG</span>
        <span className="text-zinc-700">→</span>
        <span className="text-violet-400 font-bold px-2 py-0.5 rounded bg-violet-950/50 border border-violet-500/30">0x8</span>
        <span className="text-zinc-700">→</span>
        <span className="text-violet-300 text-[10px]">winner ✓</span>
      </div>
    ),
  },
  {
    title: "Atomic Settlement",
    body: "Winners, refunds, and proceeds all settle in a single PTB. Everything or nothing. No second transactions. No admin intervention possible.",
    border: "border-emerald-500/25", glow: "rgba(16,185,129,0.1)", accent: "text-emerald-400",
    visual: (
      <div className="font-mono text-[10px] space-y-1">
        <div className="text-emerald-400">✓ winners → allocation + escrow change</div>
        <div className="text-zinc-500">↩ losers → full escrow refund</div>
        <div className="text-zinc-600">→ creator → proceeds</div>
      </div>
    ),
  },
];

// ─── How it works ─────────────────────────────────────────────────────────────

const STEPS = [
  { num: "01", label: "Register with Google", desc: "Your Google login generates a zero-knowledge proof on your device. The proof produces a nullifier — a unique on-chain fingerprint — without revealing your identity. Second registration from any address or nullifier: rejected." },
  { num: "02", label: "Seal your bid", desc: "You choose an amount and submit sha3_256(amount ‖ nonce). The hash commits you to the bid without revealing it. Miners, validators, and every other bidder see only a 32-byte hash until reveal. Front-running requires seeing the bid. You made that impossible." },
  { num: "03", label: "Reveal when the phase opens", desc: "After the commit window closes, you send your actual amount and nonce. The contract recomputes the hash and verifies it matches exactly. Reveal a different amount: rejected. Reveal late: rejected. No flexibility, by design." },
  { num: "04", label: "Anyone calls resolve", desc: "No admin required. Anyone calls resolve and the contract does the work: sort bids, find the clearing price, break ties using sui::random at 0x8. Validator DKG randomness — no single party can predict or bias it. The outcome is on-chain and permanent." },
  { num: "05", label: "Settle atomically", desc: "Winners receive their allocation and escrow change. Losers receive full refunds. Creator receives proceeds. All of this happens in one Programmable Transaction Block. Everything settles or nothing settles. No second transactions. No admin intervention." },
];

// ─── Sui primitives ───────────────────────────────────────────────────────────

const PRIMITIVES = [
  { name: "zkLogin", by: "Deepak Maram", desc: "Google login instead of a wallet — the same login re-derives the same wallet on any device. Raises Sybil cost; not proof-of-personhood.", color: "text-blue-400", border: "border-blue-500/20", bg: "bg-blue-950/20" },
  { name: "sui::random", by: "Andrew Schran", desc: "Validator DKG randomness at object 0x8. Unpredictable before the transaction. Unbiasable by any party.", color: "text-violet-400", border: "border-violet-500/20", bg: "bg-violet-950/20" },
  { name: "Seal", by: "Kostas Chalkias", desc: "Threshold encryption for nonce backup. Access policy enforced on-chain by Move. Key servers verify before releasing.", color: "text-pink-400", border: "border-pink-500/20", bg: "bg-pink-950/20" },
  { name: "Walrus", by: "Mysten Labs", desc: "Decentralized blob storage for encrypted nonces. Recoverable from any device, no backend needed.", color: "text-cyan-400", border: "border-cyan-500/20", bg: "bg-cyan-950/20" },
  { name: "Enoki", by: "Mysten Labs", desc: "Sponsored transactions for registration. Zero gas friction for participants.", color: "text-orange-400", border: "border-orange-500/20", bg: "bg-orange-950/20" },
  { name: "PTBs", by: "Sui protocol", desc: "Programmable Transaction Blocks. Winners, refunds, proceeds — one atomic transaction, no partial states.", color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-950/20" },
];

// ─── Explorer receipts ────────────────────────────────────────────────────────

const RECEIPTS = [
  { label: "Package contract", id: PACKAGE_ID, hint: "All auction logic on-chain · immutable" },
  { label: "Live auction", id: AUCTION_ID, hint: "Current state · open to inspect" },
  { label: "sui::random (0x8)", id: RANDOM_ID, hint: "Validator DKG randomness object" },
  { label: "Clock (0x6)", id: "0x6", hint: "Timestamp source for phase gating" },
];

// ─── Components ───────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#030712]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-lg tracking-tight">FairDrop</span>
          <span className="hidden sm:block text-[10px] text-zinc-700 font-mono border border-zinc-800 rounded-full px-2 py-0.5">
            Sui Overflow 2026
          </span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#how" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors hidden md:block">How it works</a>
          <a href="#why-sui" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors hidden md:block">Why Sui</a>
          <a href="#auction" className="text-xs text-zinc-600 hover:text-zinc-300 transition-colors hidden md:block">Live auction</a>
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_60%_at_65%_40%,rgba(139,92,246,0.07),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_15%_70%,rgba(59,130,246,0.05),transparent)]" />

      <div className="relative max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">

          {/* Left — copy */}
          <div className="space-y-7">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
              <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-5">
                Seal + Walrus · Sui Overflow 2026 · Testnet
              </p>
              <h1 className="text-5xl lg:text-[3.75rem] font-bold tracking-tight leading-[1.05] text-white">
                Lose your device.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-emerald-400">
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
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors">
                Launch Live Auction →
              </a>
              {AUCTION_ID && (
                <a href={objUrl(AUCTION_ID)} target="_blank" rel="noopener noreferrer"
                  className="px-5 py-2.5 bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 text-white text-sm font-semibold rounded-xl transition-colors">
                  Verify on Explorer ↗
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
                <span key={t} className="text-[11px] text-zinc-500 flex items-center gap-1">
                  <span className="text-emerald-600">✓</span> {t}
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
          </motion.div>

        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="py-20 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
            The problem
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-white mb-3">
            Every launch you&apos;ve seen was gameable.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 mb-12 max-w-xl leading-relaxed">
            Recovering your bid is the safety net. But a bid that survives still has to stay private and be allocated fairly — and that is exactly where most launches break. It looks fair from the outside; the mechanics tell a different story, one where bots, whales, and insiders have structural advantages before the first bid is placed.
          </motion.p>

          <motion.div variants={stagger} className="grid sm:grid-cols-3 gap-4">
            {PROBLEMS.map((p) => (
              <motion.div key={p.title} variants={fadeUp}
                whileHover={{ scale: 1.015 }}
                className="p-5 rounded-2xl border border-red-500/10 bg-red-950/[0.12] hover:border-red-500/20 hover:bg-red-950/20 transition-all cursor-default flex flex-col">
                <div className="text-2xl mb-3">{p.icon}</div>
                <h3 className="text-sm font-semibold text-red-300 mb-2">{p.title}</h3>
                <p className="text-xs text-zinc-500 leading-relaxed flex-1">{p.body}</p>
                <div className="mt-3 pt-3 border-t border-emerald-500/10">
                  <p className="text-[11px] text-emerald-600 leading-relaxed">
                    <span className="text-emerald-500 font-semibold">FairDrop: </span>{p.fix}
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
    <section className="py-20 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
            Privacy · Fairness · Verifiability
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-white mb-12">
            Private bids, a fair draw, verifiable settlement.
          </motion.h2>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-4">
            {FAIRNESS.map((f) => (
              <motion.div key={f.title} variants={fadeUp}
                whileHover={{ scale: 1.012 }}
                className={`p-6 rounded-2xl border ${f.border} transition-all cursor-default`}
                style={{ background: `radial-gradient(ellipse 80% 60% at 20% 0%, ${f.glow}, transparent 70%)` }}>
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
    <section id="how" className="py-20 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
            Auction lifecycle
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-white mb-2">
            Five steps. No trust required.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-600 text-xs mb-10">
            Click any step to expand.
          </motion.p>

          <motion.div variants={stagger} className="space-y-2">
            {STEPS.map((step, i) => (
              <motion.div key={step.num} variants={fadeUp}
                onClick={() => setActive(active === i ? null : i)}
                className={`group flex gap-5 p-5 rounded-2xl border transition-all cursor-pointer select-none ${
                  active === i
                    ? "border-violet-500/30 bg-violet-950/20"
                    : "border-white/[0.05] hover:border-white/10 bg-white/[0.015] hover:bg-white/[0.03]"
                }`}>
                <span className={`font-mono text-sm font-bold flex-shrink-0 mt-0.5 w-8 transition-colors ${active === i ? "text-violet-500" : "text-zinc-700"}`}>{step.num}</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold transition-colors ${active === i ? "text-white" : "text-zinc-300 group-hover:text-white"}`}>{step.label}</p>
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
                  className={`flex-shrink-0 text-sm mt-0.5 transition-colors ${active === i ? "text-violet-400" : "text-zinc-700 group-hover:text-zinc-500"}`}
                >›</motion.span>
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
    <section id="why-sui" className="py-20 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
            Powered by
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-white mb-4">
            Built entirely from Sui-native primitives.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 mb-12 max-w-xl leading-relaxed">
            No bridges. No oracles from other chains. Every fairness guarantee is enforced by Sui&apos;s own infrastructure.
          </motion.p>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRIMITIVES.map((p) => (
              <motion.div key={p.name} variants={fadeUp}
                whileHover={{ scale: 1.018 }}
                className={`p-4 rounded-xl border ${p.border} ${p.bg} transition-all cursor-default`}>
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
    <section className="py-20 border-t border-white/[0.05]">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
            Trustless by design
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-3xl font-bold text-white mb-4">
            Everything is publicly inspectable.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-500 mb-8 max-w-xl leading-relaxed">
            Every object, every transaction, every state change. Open on SuiScan right now.
          </motion.p>

          <motion.div variants={stagger} className="flex flex-wrap gap-3 mb-10">
            {[
              { label: "zkLogin verified", color: "text-blue-400 border-blue-500/20 bg-blue-950/20" },
              { label: "No backend", color: "text-emerald-400 border-emerald-500/20 bg-emerald-950/20" },
              { label: "No admin key", color: "text-emerald-400 border-emerald-500/20 bg-emerald-950/20" },
              { label: "One PTB settlement", color: "text-violet-400 border-violet-500/20 bg-violet-950/20" },
              { label: "sui::random DKG", color: "text-violet-400 border-violet-500/20 bg-violet-950/20" },
              { label: "100% on-chain state", color: "text-cyan-400 border-cyan-500/20 bg-cyan-950/20" },
            ].map((item) => (
              <motion.span key={item.label} variants={fadeUp}
                className={`text-xs font-mono px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${item.color}`}>
                <span className="text-emerald-500">✓</span> {item.label}
              </motion.span>
            ))}
          </motion.div>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 gap-3">
            {RECEIPTS.filter((r) => r.id).map((r) => (
              <motion.a key={r.label} variants={fadeUp}
                href={objUrl(r.id!)} target="_blank" rel="noopener noreferrer"
                whileHover={{ scale: 1.012 }}
                className="group flex items-center justify-between p-4 rounded-xl border border-white/[0.05] bg-white/[0.015] hover:border-emerald-500/25 hover:bg-emerald-950/10 transition-all">
                <div className="min-w-0">
                  <p className="text-sm text-white font-medium group-hover:text-emerald-300 transition-colors">{r.label}</p>
                  <p className="text-[10px] text-zinc-700 font-mono mt-0.5">{r.id!.slice(0, 20)}…</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{r.hint}</p>
                </div>
                <span className="text-zinc-700 group-hover:text-emerald-400 transition-colors text-lg flex-shrink-0 ml-4">↗</span>
              </motion.a>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function FooterSection() {
  return (
    <footer className="border-t border-white/[0.05] py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between gap-8 text-xs text-zinc-600">
        <div>
          <p className="text-white font-bold text-sm mb-1">FairDrop</p>
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
    <main className="min-h-screen bg-[#030712]">
      <NavBar />
      <HeroSection />
      <ProblemSection />
      <FairnessSection />
      <HowItWorksSection />
      <WhySuiSection />
      <VerifiabilitySection />

      {/* Live Auction */}
      <section id="auction" className="py-20 border-t border-white/[0.05]">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-10">
            <motion.p variants={fadeUp} className="text-[10px] text-zinc-600 font-mono uppercase tracking-[0.2em] mb-3">
              Live on testnet
            </motion.p>
            <motion.h2 variants={fadeUp} className="text-3xl font-bold text-white mb-2">
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
      <section className="py-28 border-t border-white/[0.05]">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <motion.h2 variants={fadeUp} className="text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight text-balance">
              Lose your device.
              {" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-emerald-400">
                Keep your bid.
              </span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-zinc-400 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
              Blind bids, a verifiable draw, atomic settlement — and a sealed bid you can recover from
              any device. No backend, no admin key, no trust beyond the Sui protocol itself.
            </motion.p>
            <motion.div variants={fadeUp} className="flex justify-center gap-4 flex-wrap">
              <a href="#auction"
                className="px-7 py-3.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors">
                Launch Live Auction →
              </a>
              {PACKAGE_ID && (
                <a href={objUrl(PACKAGE_ID)} target="_blank" rel="noopener noreferrer"
                  className="px-7 py-3.5 bg-white/[0.05] hover:bg-white/[0.09] border border-white/10 text-white text-sm font-semibold rounded-xl transition-colors">
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
