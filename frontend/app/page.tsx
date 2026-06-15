"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { ConnectButton } from "@mysten/dapp-kit";
import { LiveAuction } from "@/app/components/LiveAuction";
import { RecoveryHero } from "@/app/components/RecoveryHero";
import { ArchitectureFlow } from "@/app/components/ArchitectureFlow";
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
const IArrowDown = (p: { className?: string }) => <Icon className={p.className} d="M12 5v14m-6-6 6 6 6-6" />;
const IChevron = (p: { className?: string }) => <Icon className={p.className} d="M9 6l6 6-6 6" />;
const IBolt = (p: { className?: string }) => <Icon className={p.className} d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />;
const PATH_BOT = "M12 8V4H8M4 8h16v12H4zM2 14h2m16 0h2M9 13v2m6-2v2";
const PATH_EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
const PATH_DICE = "M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01";

// ─── Explorer helpers ─────────────────────────────────────────────────────────

const SUISCAN = `https://suiscan.xyz/${NETWORK}`;
const objUrl = (id: string) => `${SUISCAN}/object/${id}`;

// ─── Motion variants — instant snap ──────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.05 } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
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
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-zinc-700 bg-zinc-100 border border-zinc-900 px-2 py-0.5 text-[10px]">Wallet addr</span>
        <span className="text-zinc-700">→</span>
        <span className="text-zinc-900 text-[10px] font-black">sha3_256</span>
        <span className="text-zinc-700">→</span>
        <span className="text-zinc-900 text-[10px] bg-yellow-400 px-1.5 py-0.5 border border-zinc-900">0x4f2a…</span>
      </div>
    ),
  },
  {
    title: "Hidden Bids",
    body: "sha3_256(amount ‖ nonce) committed on-chain before any amount is visible. No MEV. No last-second sniping. Amount unknowable until reveal.",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-zinc-900 bg-white px-2 py-0.5 border border-zinc-900 text-[10px] font-black">5.0 SUI</span>
        <span className="text-zinc-700">→</span>
        <span className="text-zinc-900 text-[10px] font-black">sha3_256</span>
        <span className="text-zinc-700">→</span>
        <span className="text-zinc-600 text-[10px] tracking-wider font-mono">0x7c1b…????</span>
      </div>
    ),
  },
  {
    title: "Verifiable Randomness",
    body: "Ties broken by sui::random at 0x8, backed by Sui's validator distributed key generation. The outcome is on-chain, permanent, and inspectable by anyone.",
    visual: (
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-zinc-600 text-[10px]">validator DKG</span>
        <span className="text-zinc-700">→</span>
        <span className="text-zinc-900 font-black px-2 py-0.5 bg-white border-2 border-zinc-900">0x8</span>
        <span className="text-zinc-700">→</span>
        <span className="text-zinc-900 text-[10px] font-black">winner ✓</span>
      </div>
    ),
  },
  {
    title: "Trustless Settlement",
    body: "Trustless pull-settlement pattern: winners claim, losers reclaim, the creator withdraws — each a permissionless on-chain call. No admin can seize or block funds, and no batch failure can strand anyone. The contract holds no override key.",
    visual: (
      <div className="font-mono text-[10px] space-y-1">
        <div className="text-zinc-900 font-black">✓ winners → allocation + escrow change</div>
        <div className="text-zinc-600">↩ losers → full escrow refund</div>
        <div className="text-zinc-600">→ creator → proceeds</div>
      </div>
    ),
  },
];

const STEPS = [
  { num: "01", label: "Register with Google", desc: "OAuth-gated entry, raising Sybil attack costs. A Google login is required to register, and each address registers exactly once: a per-registration nullifier is committed on-chain, and a second registration from the same address or nullifier is rejected. This raises the cost of multi-wallet farming — not proof-of-personhood." },
  { num: "02", label: "Seal your bid", desc: "You choose an amount and submit sha3_256(amount ‖ nonce). The hash commits you to the bid without revealing it. Miners, validators, and every other bidder see only a 32-byte hash until reveal. Front-running requires seeing the bid. You made that impossible." },
  { num: "03", label: "Reveal when the phase opens", desc: "After the commit window closes, you send your actual amount and nonce. The contract recomputes the hash and verifies it matches exactly. Reveal a different amount: rejected. Reveal late: rejected. No flexibility, by design." },
  { num: "04", label: "Anyone calls resolve", desc: "No admin required. Anyone calls resolve and the contract does the work: sort bids, find the clearing price, break ties using sui::random at 0x8. Validator DKG randomness — no single party can predict or bias it. The outcome is on-chain and permanent." },
  { num: "05", label: "Settle, then claim", desc: "resolve runs once: it sorts bids, finds the clearing price, breaks ties with sui::random, and mints a WinnerCertificate to every winner — all in one PTB. Settlement is then pull-based: winners claim (pay the clearing price, take their change), losers reclaim their full escrow, the creator withdraws proceeds. Each is a separate permissionless call. No admin can seize or block funds; no failed batch can strand anyone." },
];

const PRIMITIVES = [
  { name: "Seal", by: "Kostas Chalkias", desc: "Threshold-encrypts your reveal secret. An on-chain Move policy (seal_approve) releases it only to you, only during reveal — no FairDrop server can decrypt it." },
  { name: "Walrus", by: "Mysten Labs", desc: "Decentralized blob storage for the encrypted secret. Recoverable from any device — no backend, no team custody." },
  { name: "zkLogin", by: "Deepak Maram", desc: "Google login instead of a wallet — the same login re-derives the same wallet on any device. Raises Sybil cost; not proof-of-personhood." },
  { name: "sui::random", by: "Andrew Schran", desc: "Validator DKG randomness at object 0x8. Unpredictable before the transaction. Unbiasable by any party." },
  { name: "Enoki", by: "Mysten Labs", desc: "The zkLogin auth flow behind the Google button — onboards users with no seed phrase and no extension. Gas is self-paid on testnet (no sponsorship)." },
  { name: "PTBs", by: "Sui protocol", desc: "Programmable Transaction Blocks compose many Move calls into one atomic transaction — resolve mints every WinnerCertificate in a single PTB. Final settlement is pull-based (claim, reclaim, withdraw), so no party can be stranded by another's failure." },
];

const RECEIPTS = [
  { label: "Package contract", id: PACKAGE_ID, hint: "auction + seal_policy Move source · immutable" },
  { label: "Live auction object", id: AUCTION_ID, hint: "commitments, reveals & winners tables · live state" },
  { label: "sui::random (0x8)", id: RANDOM_ID, hint: "validator DKG · consumed in every resolve tx" },
  { label: "Clock (0x6)", id: "0x6", hint: "timestamp source for phase gating" },
];

// ─── Components ───────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b-2 border-zinc-900 bg-white">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-zinc-900 font-black text-xl tracking-[-0.04em] uppercase">FairDrop</span>
          <span className="hidden sm:block text-[9px] text-zinc-900 font-mono border border-zinc-900 px-2 py-0.5">
            Sui Overflow 2026
          </span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#how" className="text-[11px] text-zinc-900 hover:bg-yellow-400 px-2 py-1 transition-none hidden md:block font-mono uppercase tracking-widest">How it works</a>
          <a href="#why-sui" className="text-[11px] text-zinc-900 hover:bg-yellow-400 px-2 py-1 transition-none hidden md:block font-mono uppercase tracking-widest">Why Sui</a>
          <a href="#auction" className="text-[11px] text-zinc-900 hover:bg-yellow-400 px-2 py-1 transition-none hidden md:block font-mono uppercase tracking-widest">Live auction</a>
          <a href="/umbra" className="inline-flex items-center gap-1 text-[11px] font-black text-zinc-900 border-2 border-zinc-900 px-3 py-1.5 hover:bg-yellow-400 transition-none shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"><IBolt className="w-3.5 h-3.5" /> Umbra</a>
          <ConnectButton />
        </div>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-x-clip pt-12 pb-16 lg:pt-16 lg:pb-24 border-b-2 border-zinc-900">
      <div className="relative max-w-[1400px] mx-auto px-6">
        <div className="grid lg:grid-cols-[3fr_2fr] items-start">

          {/* Left — editorial copy */}
          <div className="border-b-2 lg:border-b-0 lg:border-r-2 border-zinc-900 pb-8 lg:pb-0 lg:pr-12">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.05 }}>
              <p className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.4em] mb-6 border-l-4 border-zinc-900 pl-3">
                Sealed-Bid · Fair-Launch Auction · Testnet
              </p>
              <h1 className="overflow-visible font-black tracking-[-0.05em] leading-[0.82] text-zinc-900" style={{ fontSize: "clamp(3.5rem, 12vw, 10rem)" }}>
                Lose your
                <br />
                device.
                <br />
                Keep
                <br />
                your bid.
              </h1>
            </motion.div>

            <motion.p
              className="text-zinc-700 text-base leading-relaxed max-w-md mt-8 pl-4 border-l-2 border-zinc-900"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.05 }}
            >
              One Google login, a blind bid only you can open. Lose this device and the bid lands
              on the next one — held on Walrus, locked by Seal. No server, no FairDrop team, ever sees it.
            </motion.p>

            {/* Data cluster */}
            <div className="mt-6 border-t-2 border-zinc-900 pt-3 font-mono text-[9px] text-zinc-500 grid grid-cols-3 gap-px border-2 border-zinc-900 p-0">
              <div className="border-r border-zinc-900 p-2">sha3_256(amount‖nonce)</div>
              <div className="border-r border-zinc-900 p-2">blob_id → Walrus</div>
              <div className="p-2">seal_approve → Entry</div>
            </div>

            <motion.p
              className="text-zinc-600 text-xs max-w-md mt-4 font-mono"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.05 }}
            >
              zkLogin re-derives the same wallet on any device. Raises Sybil cost — not Sybil-proof.
            </motion.p>

            <motion.div
              className="flex flex-wrap gap-3 mt-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.05 }}
            >
              <a href="#auction"
                className="px-6 py-3 bg-zinc-900 text-white text-sm font-black uppercase tracking-wide border-2 border-zinc-900 hover:bg-yellow-400 hover:text-zinc-900 transition-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-2 active:translate-y-2">
                Launch Live Auction →
              </a>
              {AUCTION_ID && (
                <a href={objUrl(AUCTION_ID)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-6 py-3 bg-white border-2 border-zinc-900 text-zinc-900 text-sm font-black uppercase tracking-wide hover:bg-yellow-400 transition-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                  Verify on Explorer <IExternal className="w-3.5 h-3.5" />
                </a>
              )}
            </motion.div>

            <motion.div
              className="flex flex-wrap gap-x-4 gap-y-1 pt-4 mt-4 border-t-2 border-zinc-900"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.05 }}
            >
              {[
                "Bids hidden until reveal",
                "Recover from any device",
                "No backend",
                "No admin key",
              ].map((t) => (
                <span key={t} className="text-[10px] text-zinc-900 flex items-center gap-1.5 font-mono uppercase tracking-wide">
                  <ICheck className="w-3 h-3" /> {t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Right — recovery handoff */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.05 }}
            className="lg:pl-12 pt-8 lg:pt-0"
          >
            <div className="border-2 border-zinc-900 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)]">
              <div className="border-b-2 border-zinc-900 px-4 py-2 bg-zinc-900 flex items-center justify-between">
                <span className="text-[9px] font-mono uppercase tracking-[0.3em] text-white">recovery centerpiece</span>
                <span className="w-2 h-2 bg-yellow-400" />
              </div>
              <div className="p-4 bg-white">
                <RecoveryHero />
              </div>
            </div>
            <a
              href="#auction"
              className="group mt-4 flex items-center justify-center gap-2 border-2 border-zinc-900 px-4 py-3 text-sm font-black uppercase tracking-wide text-zinc-900 hover:bg-yellow-400 transition-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
            >
              Try it on a live bid
              <IArrowDown className="w-4 h-4" />
            </a>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  return (
    <section className="py-24 border-t-2 border-zinc-900">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.3em] mb-3 border-l-4 border-zinc-900 pl-3">
            The problem
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-5xl lg:text-7xl font-black tracking-[-0.04em] text-zinc-900 mb-3 leading-[0.88]">
            Every launch you&apos;ve<br />seen was gameable.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-600 mb-12 max-w-xl leading-relaxed pl-4 border-l-2 border-zinc-900">
            Recovering your bid is the safety net. But a bid that survives still has to stay private and be allocated fairly — and that is exactly where most launches break. It looks fair from the outside; the mechanics tell a different story.
          </motion.p>

          <motion.div variants={stagger} className="grid sm:grid-cols-3 border-2 border-zinc-900">
            {PROBLEMS.map((p, idx) => (
              <motion.div key={p.title} variants={fadeUp}
                className={`p-5 bg-white hover:bg-yellow-400 transition-none cursor-default flex flex-col ${idx < PROBLEMS.length - 1 ? "border-b-2 sm:border-b-0 sm:border-r-2 border-zinc-900" : ""}`}>
                <div className="w-9 h-9 border-2 border-zinc-900 flex items-center justify-center mb-3">
                  <Icon d={p.icon} className="w-5 h-5 text-zinc-900" />
                </div>
                <h3 className="text-sm font-black text-zinc-900 mb-2 uppercase tracking-wide">{p.title}</h3>
                <p className="text-xs text-zinc-600 leading-relaxed flex-1">{p.body}</p>
                <div className="mt-3 pt-3 border-t-2 border-zinc-900">
                  <p className="text-[11px] text-zinc-900 leading-relaxed font-mono">
                    <span className="font-black">FairDrop: </span>{p.fix}
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
    <section className="py-24 border-t-2 border-zinc-900">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.3em] mb-3 border-l-4 border-zinc-900 pl-3">
            Privacy · Fairness · Verifiability
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-5xl lg:text-7xl font-black tracking-[-0.04em] text-zinc-900 mb-12 leading-[0.88]">
            Private bids, a fair draw,<br />verifiable settlement.
          </motion.h2>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 border-2 border-zinc-900">
            {FAIRNESS.map((f, idx) => (
              <motion.div key={f.title} variants={fadeUp}
                className={`p-6 bg-white hover:bg-yellow-400 transition-none cursor-default border-zinc-900 ${idx % 2 === 0 ? "border-b-2 sm:border-b-0 sm:border-r-2" : idx === 1 ? "border-b-2" : ""}`}>
                <div className="mb-4 min-h-[28px] flex items-center">{f.visual}</div>
                <h3 className="text-base font-black text-zinc-900 mb-2 uppercase tracking-wide">{f.title}</h3>
                <p className="text-xs text-zinc-700 leading-relaxed">{f.body}</p>
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
    <section id="how" className="py-24 border-t-2 border-zinc-900">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.3em] mb-3 border-l-4 border-zinc-900 pl-3">
            Auction lifecycle
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-5xl lg:text-7xl font-black tracking-[-0.04em] text-zinc-900 mb-2 leading-[0.88]">
            Five steps.<br />No trust required.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-600 text-xs mb-10 font-mono uppercase tracking-widest">
            Click any step to expand.
          </motion.p>

          <motion.div variants={stagger} className="border-2 border-zinc-900">
            {STEPS.map((step, i) => (
              <motion.div key={step.num} variants={fadeUp}
                onClick={() => setActive(active === i ? null : i)}
                className={`group flex gap-5 p-5 transition-none cursor-pointer select-none border-zinc-900 ${i < STEPS.length - 1 ? "border-b-2" : ""} ${
                  active === i ? "bg-yellow-400" : "bg-white hover:bg-yellow-400"
                }`}>
                <span className={`font-mono text-4xl lg:text-5xl font-black flex-shrink-0 leading-none w-14 lg:w-16 ${active === i ? "text-zinc-900" : "text-zinc-200"}`}>{step.num}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black uppercase tracking-wide text-zinc-900">{step.label}</p>
                  <AnimatePresence initial={false}>
                    {active === i && (
                      <motion.p
                        key="desc"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.05 }}
                        className="text-xs text-zinc-700 leading-relaxed mt-2"
                      >
                        {step.desc}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                <motion.span
                  animate={{ rotate: active === i ? 90 : 0 }}
                  transition={{ duration: 0.05 }}
                  className="flex-shrink-0 mt-1 text-zinc-900"
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
    <section id="why-sui" className="py-24 border-t-2 border-zinc-900">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.3em] mb-3 border-l-4 border-zinc-900 pl-3">
            Powered by
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-5xl lg:text-7xl font-black tracking-[-0.04em] text-zinc-900 mb-4 leading-[0.88]">
            Built entirely from<br />Sui-native primitives.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-600 mb-12 max-w-xl leading-relaxed pl-4 border-l-2 border-zinc-900">
            No bridges. No oracles from other chains. Every fairness guarantee is enforced by Sui&apos;s own infrastructure.
          </motion.p>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 lg:grid-cols-3 border-2 border-zinc-900">
            {PRIMITIVES.map((p, idx) => (
              <motion.div key={p.name} variants={fadeUp}
                className={`p-4 bg-white hover:bg-yellow-400 transition-none cursor-default border-zinc-900 ${idx % 3 !== 2 ? "border-r-2" : ""} ${idx < 3 ? "border-b-2" : ""}`}>
                <div className="flex items-start justify-between mb-2">
                  <span className="text-sm font-black text-zinc-900 font-mono uppercase">{p.name}</span>
                  <span className="text-[9px] text-zinc-600 mt-0.5 font-mono">by {p.by}</span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">{p.desc}</p>
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
    <section className="py-24 border-t-2 border-zinc-900">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
          <motion.p variants={fadeUp} className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.3em] mb-3 border-l-4 border-zinc-900 pl-3">
            Verifiability
          </motion.p>
          <motion.h2 variants={fadeUp} className="text-5xl lg:text-7xl font-black tracking-[-0.04em] text-zinc-900 mb-4 leading-[0.88]">
            Don&apos;t trust us.<br />Verify it yourself.
          </motion.h2>
          <motion.p variants={fadeUp} className="text-zinc-600 mb-8 max-w-xl leading-relaxed pl-4 border-l-2 border-zinc-900">
            Every object, transaction, and state change is on-chain. Open the live objects below on SuiScan, then trace any auction&apos;s artifacts — commitments, reveals, the resolve transaction, and winner certificates — straight from its history.
          </motion.p>

          <motion.div variants={stagger} className="flex flex-wrap border-2 border-zinc-900 mb-4">
            {[
              { label: "Google-gated entry" },
              { label: "No backend" },
              { label: "No admin key" },
              { label: "One PTB settlement" },
              { label: "sui::random DKG" },
              { label: "100% on-chain state" },
            ].map((item) => (
              <motion.span key={item.label} variants={fadeUp}
                className="text-[10px] font-mono px-3 py-2 text-zinc-900 border-b border-r border-zinc-900 flex items-center gap-1.5 uppercase tracking-widest hover:bg-yellow-400 transition-none">
                <ICheck className="w-3 h-3" /> {item.label}
              </motion.span>
            ))}
          </motion.div>

          <motion.div variants={stagger} className="grid sm:grid-cols-2 border-2 border-zinc-900 mb-4">
            {RECEIPTS.filter((r) => r.id).map((r, idx) => (
              <motion.a key={r.label} variants={fadeUp}
                href={objUrl(r.id!)} target="_blank" rel="noopener noreferrer"
                className={`group flex items-center justify-between p-4 bg-white hover:bg-yellow-400 transition-none border-zinc-900 ${idx % 2 === 0 ? "border-r-2" : ""} ${idx < 2 ? "border-b-2" : ""}`}>
                <div className="min-w-0">
                  <p className="text-sm text-zinc-900 font-black uppercase tracking-wide">{r.label}</p>
                  <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{r.id!.slice(0, 20)}…</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">{r.hint}</p>
                </div>
                <span className="text-zinc-900 text-lg flex-shrink-0 ml-4 font-black">↗</span>
              </motion.a>
            ))}
          </motion.div>

          <motion.div variants={fadeUp} className="border-2 border-zinc-900 bg-white p-4">
            <p className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.3em] mb-3 border-l-4 border-zinc-900 pl-3">Trace any auction</p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px]">
              {[
                { k: "Commitment", v: "hash only — no amount on-chain until reveal" },
                { k: "BidRevealed event", v: "amount appears here, in the reveal tx" },
                { k: "Resolve tx", v: "consumes 0x8 — selects winners via DKG randomness" },
                { k: "WinnerCertificate", v: "minted on-chain to each winner" },
              ].map((a) => (
                <div key={a.k} className="flex items-baseline gap-2">
                  <span className="text-zinc-900 font-black flex-shrink-0">{a.k}</span>
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
    <footer className="border-t-2 border-zinc-900 py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row justify-between gap-8 text-xs text-zinc-600">
        <div>
          <p className="text-zinc-900 font-black text-sm mb-1 uppercase tracking-wide">FairDrop</p>
          <p className="mb-1 font-mono">Fair launch protocol · Sui Overflow 2026</p>
          {PACKAGE_ID && (
            <a href={objUrl(PACKAGE_ID)} target="_blank" rel="noopener noreferrer"
              className="font-mono text-[10px] hover:bg-yellow-400 hover:text-zinc-900 transition-none">
              {PACKAGE_ID.slice(0, 22)}… ↗
            </a>
          )}
        </div>
        <div>
          <p className="text-zinc-900 font-black mb-2 uppercase tracking-wide">Sui-native primitives</p>
          <div className="flex flex-wrap gap-x-0 gap-y-0 font-mono text-[10px] border border-zinc-900">
            {["zkLogin", "sui::random", "Seal", "Walrus", "Enoki", "Pyth"].map((s) => (
              <span key={s} className="border-r border-b border-zinc-900 px-2 py-0.5">{s}</span>
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
      <ArchitectureFlow />
      <WhySuiSection />
      <VerifiabilitySection />

      {/* Live Auction */}
      <section id="auction" className="py-24 border-t-2 border-zinc-900">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-10">
            <motion.p variants={fadeUp} className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.3em] mb-3 border-l-4 border-zinc-900 pl-3">
              Live on testnet
            </motion.p>
            <motion.h2 variants={fadeUp} className="text-5xl lg:text-7xl font-black tracking-[-0.04em] text-zinc-900 mb-2 leading-[0.88]">
              Participate in<br />a live auction.
            </motion.h2>
            <motion.p variants={fadeUp} className="text-zinc-600 text-sm font-mono">
              All state is on-chain. Every action is verifiable. No server involved.
            </motion.p>
          </motion.div>
          <LiveAuction />
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-28 border-t-2 border-zinc-900">
        <div className="max-w-6xl mx-auto px-6">
          <motion.div variants={stagger} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <motion.h2 variants={fadeUp} className="text-6xl lg:text-8xl font-black text-zinc-900 mb-6 leading-[0.88] tracking-[-0.05em]">
              Lose your device.
              <br />
              Keep your bid.
            </motion.h2>
            <motion.p variants={fadeUp} className="text-zinc-600 text-lg mb-10 max-w-lg leading-relaxed pl-4 border-l-2 border-zinc-900">
              Blind bids, a verifiable draw, atomic settlement — and a sealed bid you can recover from
              any device. No backend, no admin key, no trust beyond the Sui protocol itself.
            </motion.p>
            <motion.div variants={fadeUp} className="flex gap-4 flex-wrap">
              <a href="#auction"
                className="px-8 py-4 bg-zinc-900 text-white text-sm font-black uppercase tracking-wide border-2 border-zinc-900 hover:bg-yellow-400 hover:text-zinc-900 transition-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                Launch Live Auction →
              </a>
              {PACKAGE_ID && (
                <a href={objUrl(PACKAGE_ID)} target="_blank" rel="noopener noreferrer"
                  className="px-8 py-4 bg-white border-2 border-zinc-900 text-zinc-900 text-sm font-black uppercase tracking-wide hover:bg-yellow-400 transition-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
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
