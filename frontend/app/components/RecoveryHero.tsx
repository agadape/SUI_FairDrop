"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

function HIcon({ d, className = "w-4 h-4" }: { d: string; className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden><path d={d} /></svg>;
}
const HLock = (p: { className?: string }) => <HIcon className={p.className} d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />;
const HUnlock = (p: { className?: string }) => <HIcon className={p.className} d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-1.3" />;

// ─── RecoveryHero ───────────────────────────────────────────────────────────
//
// Isolated visual for the frozen hero narrative: "Lose your device. Keep your bid."
// A self-running loop showing a sealed bid surviving device loss:
//   Device A (lost) → encrypted backup → Walrus → Seal → Device B (recovered).
//
// Subtle motion only (opacity / scale / glow). No new dependencies — framer-motion
// is already used across the app. Reduced-motion users see the recovered end-state.
// Not yet wired into the landing hierarchy; safe to mount standalone.

type Phase = 0 | 1 | 2 | 3; // 0 intact · 1 lost · 2 recovering · 3 recovered
const PHASE_MS: Record<Phase, number> = { 0: 1800, 1: 1000, 2: 2200, 3: 1600 };
const SPRING = { type: "spring", damping: 22, stiffness: 200 } as const;

function StatusDot({ active, color, label }: { active: boolean; color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <motion.span
        className={`inline-block w-1.5 h-1.5 rounded-full ${active ? color : "bg-zinc-700"}`}
        animate={active ? { opacity: [0.5, 1, 0.5] } : { opacity: 0.5 }}
        transition={{ duration: 1.4, repeat: active ? Infinity : 0 }}
      />
      <span className={`text-[10px] font-mono ${active ? "text-zinc-300" : "text-zinc-600"}`}>{label}</span>
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div className="relative ml-[18px] my-1 h-4 w-px bg-zinc-800">
      <motion.span
        className="absolute -left-[3px] top-0 w-1.5 h-1.5 rounded-full bg-white/40"
        animate={active ? { y: [0, 14], opacity: [0, 0.9, 0] } : { opacity: 0 }}
        transition={{ duration: 0.7, repeat: active ? Infinity : 0, repeatDelay: 0.6, ease: "linear" }}
      />
    </div>
  );
}

export function RecoveryHero({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>(0);

  useEffect(() => {
    if (reduced) {
      setPhase(3);
      return;
    }
    const next = setTimeout(() => setPhase((p) => ((p + 1) % 4) as Phase), PHASE_MS[phase]);
    return () => clearTimeout(next);
  }, [phase, reduced]);

  const lost = phase >= 1;
  const walrusActive = phase >= 2;
  const sealActive = phase >= 2;
  const recovered = phase === 3;

  return (
    <div className={`mx-auto w-full max-w-sm ${className}`} aria-label="Lose your device, keep your bid — recovery flow">
      {/* Device A — this device */}
      <motion.div
        className="rounded-2xl border border-amber-500/25 bg-amber-950/15 px-4 py-3"
        animate={{ opacity: lost ? 0.4 : 1, filter: lost ? "grayscale(1)" : "grayscale(0)" }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">This device</span>
          {lost ? (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[10px] font-mono text-red-400"
            >device lost</motion.span>
          ) : (
            <motion.span
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="text-amber-400"
            ><HLock className="w-3.5 h-3.5" /></motion.span>
          )}
        </div>
        <div className="mt-1 font-mono text-xl font-bold text-amber-500/60 tracking-[0.15em] select-none">●●●● SUI</div>
        <div className="mt-0.5 font-mono text-[10px] text-zinc-600">commit 0x7c1b…????</div>
      </motion.div>

      <Connector active={phase === 1} />

      {/* Walrus — stored */}
      <motion.div
        className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
          walrusActive ? "border-cyan-500/30 bg-cyan-950/20 glow-cyan" : "border-white/[0.06] bg-white/[0.02]"
        }`}
        animate={{ scale: phase === 2 ? [1, 1.02, 1] : 1 }}
        transition={{ duration: 0.6 }}
      >
        <span className={`text-sm font-semibold font-mono ${walrusActive ? "text-cyan-400" : "text-zinc-600"}`}>Walrus</span>
        <StatusDot active={walrusActive} color="bg-cyan-400" label={walrusActive ? "blob stored" : "off-device backup"} />
      </motion.div>

      <Connector active={phase === 2} />

      {/* Seal — authorized */}
      <motion.div
        className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${
          sealActive ? "border-pink-500/30 bg-pink-950/20 glow-pink" : "border-white/[0.06] bg-white/[0.02]"
        }`}
        animate={{ scale: phase === 2 ? [1, 1.03, 1] : 1 }}
        transition={{ ...SPRING }}
      >
        <span className={`text-sm font-semibold font-mono ${sealActive ? "text-fuchsia-400" : "text-zinc-600"}`}>Seal</span>
        <span className={sealActive ? "text-fuchsia-400" : "text-zinc-600"}>{sealActive ? <HUnlock className="w-4 h-4" /> : <HLock className="w-4 h-4" />}</span>
      </motion.div>

      <Connector active={phase === 2} />

      {/* Device B — recovered */}
      <motion.div
        className={`rounded-2xl border px-4 py-3 ${
          recovered ? "border-emerald-500/30 bg-emerald-950/20 glow-emerald" : "border-dashed border-white/10 bg-white/[0.015]"
        }`}
        animate={recovered ? { scale: [0.96, 1] } : { scale: 1 }}
        transition={{ ...SPRING }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Any browser</span>
          {recovered ? (
            <span className="text-emerald-400 text-sm">✓</span>
          ) : (
            <span className="text-[10px] font-mono text-zinc-600">awaiting…</span>
          )}
        </div>
        {recovered ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-300 tracking-tight">5.0 SUI recovered</div>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-950/30 px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-[10px] font-mono text-blue-300">same wallet · zkLogin</span>
            </div>
          </motion.div>
        ) : (
          <div className="mt-1 font-mono text-xl font-bold text-zinc-700 tracking-[0.15em] select-none">———</div>
        )}
      </motion.div>

      {/* caption — surfaces sponsors only as functional waypoints */}
      <p className="mt-3 text-center text-[10px] font-mono text-zinc-600">
        on <span className="text-cyan-500">Walrus</span> · behind <span className="text-pink-500">Seal</span> · re-derived by <span className="text-blue-400">zkLogin</span>
      </p>
    </div>
  );
}
