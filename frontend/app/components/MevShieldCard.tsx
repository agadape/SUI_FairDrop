"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { NETWORK, MIST_PER_SUI } from "@/lib/constants";
import { useSuiUsdPrice } from "@/lib/pyth";

const objUrl = (id: string) => `https://suiscan.xyz/${NETWORK}/object/${id}`;

function MIcon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d={d} /></svg>;
}
const MShield = (p: { className?: string }) => <MIcon className={p.className} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />;
const MCheck = (p: { className?: string }) => <MIcon className={p.className} d="M20 6 9 17l-5-5" />;
const MExternal = (p: { className?: string }) => <MIcon className={p.className} d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />;

// Fine grain so the card reads as brushed metal, not flat fill.
const NOISE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

// The visceral, shareable receipt minted/evolved by umbra_swap::claim_fill.
// total_saved / last_saved are MIST of uniform-price improvement shielded on-chain.
export function MevShieldCard({
  nftId,
  trades,
  totalSavedMist,
  lastSavedMist,
}: {
  nftId: string;
  trades: number;
  totalSavedMist: string;
  lastSavedMist: string;
}) {
  const usd = useSuiUsdPrice();
  const [copied, setCopied] = useState(false);

  const savedSui = Number(BigInt(totalSavedMist)) / Number(MIST_PER_SUI);
  const lastSui = Number(BigInt(lastSavedMist)) / Number(MIST_PER_SUI);
  const savedUsd = usd !== null ? savedSui * usd : null;

  function share() {
    const text =
      `I shielded ${savedSui.toFixed(4)} SUI from MEV across ${trades} confidential ` +
      `trade${trades === 1 ? "" : "s"} on Umbra — orders sealed until settlement, ` +
      `front-runners saw nothing.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      className="relative overflow-hidden rounded-2xl border border-white/15 ring-1 ring-inset ring-white/[0.06] p-5 sm:p-6 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)]"
      style={{ background: "linear-gradient(150deg, #1b1d22 0%, #0b0c0e 45%, #16181d 100%)" }}
    >
      {/* brushed-metal grain + tint + top sheen */}
      <div aria-hidden className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-[0.07]" style={{ backgroundImage: `url("${NOISE}")`, backgroundSize: "140px 140px" }} />
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 0% 0%, rgba(34,211,238,0.10), transparent 55%), radial-gradient(120% 90% at 100% 100%, rgba(217,70,239,0.09), transparent 55%)" }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-7 h-7 rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-300"><MShield className="w-4 h-4" /></span>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400">Umbra MEV Shield</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-600 tabular-nums">#{trades}</span>
        </div>

        {/* Headline figure */}
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">Total MEV shielded</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-mono text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-zinc-50 via-cyan-200 to-fuchsia-200 tabular-nums">
              {savedSui.toFixed(4)}
            </span>
            <span className="text-zinc-400 font-semibold">SUI</span>
            {savedUsd !== null && (
              <span className="text-zinc-600 text-sm font-mono tabular-nums">≈ ${savedUsd.toFixed(2)}</span>
            )}
          </div>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Trades shielded</p>
            <p className="text-xl font-bold text-zinc-100 tabular-nums mt-0.5">{trades}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">This trade</p>
            <p className="text-xl font-bold text-cyan-300 tabular-nums mt-0.5">{lastSui.toFixed(4)} <span className="text-xs text-zinc-500 font-normal">SUI</span></p>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Sealed by <span className="text-fuchsia-400">Seal</span> · stored on <span className="text-cyan-400">Walrus</span> ·
          cleared by <span className="text-zinc-300 font-mono">sui::random</span>. Front-runners saw a 32-byte shadow.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <button onClick={share}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold text-zinc-950 bg-gradient-to-r from-cyan-300 to-fuchsia-300 hover:from-cyan-200 hover:to-fuchsia-200 active:scale-[0.98] transition">
            {copied ? <><MCheck className="w-3.5 h-3.5" /> Copied</> : "Flex it"}
          </button>
          <a href={objUrl(nftId)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold border border-white/10 text-zinc-300 hover:bg-white/[0.06] active:scale-[0.98] transition font-mono">
            On-chain <MExternal className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}
