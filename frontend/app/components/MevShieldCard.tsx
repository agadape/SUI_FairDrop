"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { NETWORK, MIST_PER_SUI } from "@/lib/constants";
import { useSuiUsdPrice } from "@/lib/pyth";

const objUrl = (id: string) => `https://suiscan.xyz/${NETWORK}/object/${id}`;

function MIcon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d={d} /></svg>;
}
const MCheck = (p: { className?: string }) => <MIcon className={p.className} d="M20 6 9 17l-5-5" />;
const MExternal = (p: { className?: string }) => <MIcon className={p.className} d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />;

// Deterministic barcode pattern (bar widths in px) — no randomness in render.
const BARS = [3, 1, 2, 1, 4, 1, 1, 2, 3, 1, 2, 1, 3, 1, 1, 4, 2, 1, 3, 1, 2, 1, 1, 3, 2, 4, 1, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 4, 1, 2];

// The on-chain receipt minted/evolved by umbra_swap::claim_fill — styled as a
// stark monochrome boarding pass. total_saved / last_saved are MIST of
// uniform-price improvement shielded on-chain.
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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border border-white/25 bg-black"
    >
      {/* stub header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/15">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-white">Umbra / MEV Shield</span>
        <span className="font-mono text-[11px] text-zinc-500 tabular-nums">NO.{String(trades).padStart(3, "0")}</span>
      </div>

      {/* headline */}
      <div className="px-5 py-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500">Total MEV shielded</p>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-mono text-5xl sm:text-6xl font-bold text-white tabular-nums tracking-tighter">{savedSui.toFixed(4)}</span>
          <span className="font-mono text-lg text-zinc-400">SUI</span>
        </div>
        {savedUsd !== null && <p className="mt-1 font-mono text-xs text-zinc-600 tabular-nums">≈ ${savedUsd.toFixed(2)} USD</p>}

        <div className="mt-6 grid grid-cols-2 border-t border-white/15">
          <div className="py-3 pr-4 border-r border-white/15">
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Trades</p>
            <p className="font-mono text-xl text-white tabular-nums mt-0.5">{trades}</p>
          </div>
          <div className="py-3 pl-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">This fill</p>
            <p className="font-mono text-xl text-white tabular-nums mt-0.5">{lastSui.toFixed(4)}</p>
          </div>
        </div>
      </div>

      {/* perforation */}
      <div className="relative border-t border-dashed border-white/25">
        <span className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-black border border-white/25" />
        <span className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-black border border-white/25" />
      </div>

      {/* barcode */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-end gap-[2px] h-9" aria-hidden>
          {BARS.map((w, i) => (
            <span key={i} className="bg-white" style={{ width: `${w}px`, height: "100%" }} />
          ))}
        </div>
        <p className="mt-2 font-mono text-[9px] tracking-[0.3em] text-zinc-600 uppercase">sealed · walrus · sui::random</p>
      </div>

      {/* actions */}
      <div className="flex border-t border-white/15">
        <button onClick={share}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 font-mono text-[11px] uppercase tracking-widest text-black bg-white hover:bg-zinc-200 active:scale-[0.99] transition">
          {copied ? <><MCheck className="w-3.5 h-3.5" /> Copied</> : "Flex it"}
        </button>
        <a href={objUrl(nftId)} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-white border-l border-white/15 hover:bg-white/[0.06] transition">
          On-chain <MExternal className="w-3.5 h-3.5" />
        </a>
      </div>
    </motion.div>
  );
}
