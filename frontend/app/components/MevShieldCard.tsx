"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { NETWORK, MIST_PER_SUI } from "@/lib/constants";
import { useSuiUsdPrice } from "@/lib/pyth";

const objUrl = (id: string) => `https://suiscan.xyz/${NETWORK}/object/${id}`;

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
      `front-runners saw nothing. 🛡️`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 18 }}
      className="relative overflow-hidden rounded-2xl border border-cyan-500/30 p-5 sm:p-6"
      style={{ background: "radial-gradient(120% 100% at 0% 0%, rgba(34,211,238,0.12), transparent 60%), radial-gradient(120% 100% at 100% 100%, rgba(236,72,153,0.12), transparent 60%), #09090b" }}
    >
      {/* pulsing aura */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-1 rounded-2xl"
        animate={{ opacity: [0.25, 0.5, 0.25] }}
        transition={{ duration: 3.5, repeat: Infinity }}
        style={{ background: "radial-gradient(60% 60% at 50% 0%, rgba(34,211,238,0.15), transparent 70%)" }}
      />

      <div className="relative space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛡️</span>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400/80">Umbra MEV Shield · dynamic NFT</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-600">#{trades}</span>
        </div>

        {/* Headline figure */}
        <div>
          <p className="text-[11px] text-zinc-500 uppercase tracking-widest">Total MEV shielded</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-pink-300 tabular-nums">
              {savedSui.toFixed(4)}
            </span>
            <span className="text-cyan-400/70 font-semibold">SUI</span>
            {savedUsd !== null && (
              <span className="text-zinc-500 text-sm font-mono">≈ ${savedUsd.toFixed(2)}</span>
            )}
          </div>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">Trades shielded</p>
            <p className="text-xl font-bold text-zinc-100 tabular-nums">{trades}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest">This trade</p>
            <p className="text-xl font-bold text-cyan-300 tabular-nums">{lastSui.toFixed(4)} <span className="text-xs text-zinc-500 font-normal">SUI</span></p>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Sealed by <span className="text-pink-400">Seal</span> · stored on <span className="text-cyan-400">Walrus</span> ·
          cleared by <span className="text-violet-400 font-mono">sui::random</span>. Front-runners saw a 32-byte shadow.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <button onClick={share}
            className="flex-1 py-2 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-pink-600 hover:from-cyan-500 hover:to-pink-500 transition-colors">
            {copied ? "Copied ✓" : "Flex it (copy) →"}
          </button>
          <a href={objUrl(nftId)} target="_blank" rel="noopener noreferrer"
            className="py-2 px-3 rounded-lg text-xs font-semibold border border-white/10 text-zinc-300 hover:bg-white/[0.06] transition-colors font-mono">
            On-chain ↗
          </a>
        </div>
      </div>
    </motion.div>
  );
}
