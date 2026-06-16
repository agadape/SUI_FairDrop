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
        className={`inline-block w-1.5 h-1.5 rounded-full ${active ? color : "bg-zinc-300"}`}
        animate={active ? { opacity: [0.5, 1, 0.5] } : { opacity: 0.5 }}
        transition={{ duration: 1.4, repeat: active ? Infinity : 0 }}
      />
      <span className={`text-[9px] font-mono tracking-[0.1em] uppercase ${active ? "text-zinc-500" : "text-zinc-400"}`}>{label}</span>
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div className="relative flex justify-start ml-[22px] my-0.5 h-5 w-px">
      <div className="w-px h-full bg-zinc-100" />
      <motion.span
        className="absolute -left-[3px] top-0 w-1.5 h-1.5 rounded-full bg-zinc-400"
        animate={active ? { y: [0, 18], opacity: [0, 1, 0] } : { opacity: 0 }}
        transition={{ duration: 0.65, repeat: active ? Infinity : 0, repeatDelay: 0.5, ease: "linear" }}
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
    <div className={`w-full space-y-0 ${className}`} aria-label="Lose your device, keep your bid — recovery flow">

      {/* Device A — this device */}
      <motion.div
        className="rounded-2xl border bg-zinc-950 px-4 py-3 border-zinc-800"
        animate={{ opacity: lost ? 0.3 : 1, filter: lost ? "grayscale(1)" : "grayscale(0)" }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`w-1 h-4 rounded-full ${lost ? "bg-red-600" : "bg-amber-400"}`} />
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.15em]">Primary device</span>
          </div>
          {lost ? (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[9px] font-mono text-red-500 tracking-wide">OFFLINE</motion.span>
          ) : (
            <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }} className="text-amber-400">
              <HLock className="w-3.5 h-3.5" />
            </motion.span>
          )}
        </div>
        <div className="font-mono text-base font-bold text-amber-400 tracking-[0.2em] select-none">●●●● SUI</div>
        <div className="mt-0.5 font-mono text-[9px] text-zinc-600">commit · 0x7c1b…????</div>
      </motion.div>

      <Connector active={phase === 1} />

      {/* Walrus — stored */}
      <motion.div
        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors duration-500 ${
          walrusActive
            ? "border-cyan-200 bg-white shadow-[inset_0_0_0_1px_rgba(6,182,212,0.12)]"
            : "border-zinc-100 bg-zinc-50"
        }`}
        animate={{ scale: phase === 2 ? [1, 1.02, 1] : 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-1 h-6 rounded-full transition-colors duration-500 ${walrusActive ? "bg-cyan-400" : "bg-zinc-200"}`} />
          <div>
            <div className={`text-[11px] font-bold font-mono tracking-wide transition-colors duration-300 ${walrusActive ? "text-cyan-700" : "text-zinc-500"}`}>WALRUS</div>
            <div className="text-[9px] font-mono text-zinc-400 mt-0.5">{walrusActive ? "blob_id · stored" : "off-device backup"}</div>
          </div>
        </div>
        <StatusDot active={walrusActive} color="bg-cyan-400" label={walrusActive ? "active" : "standby"} />
      </motion.div>

      <Connector active={phase === 2} />

      {/* Seal — authorized */}
      <motion.div
        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors duration-500 ${
          sealActive
            ? "border-rose-200 bg-white shadow-[inset_0_0_0_1px_rgba(244,63,94,0.1)]"
            : "border-zinc-100 bg-zinc-50"
        }`}
        animate={{ scale: phase === 2 ? [1, 1.03, 1] : 1 }}
        transition={{ ...SPRING }}
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-1 h-6 rounded-full transition-colors duration-500 ${sealActive ? "bg-rose-400" : "bg-zinc-200"}`} />
          <div>
            <div className={`text-[11px] font-bold font-mono tracking-wide transition-colors duration-300 ${sealActive ? "text-rose-600" : "text-zinc-500"}`}>SEAL</div>
            <div className="text-[9px] font-mono text-zinc-400 mt-0.5">{sealActive ? "policy · approved" : "threshold t=2"}</div>
          </div>
        </div>
        <span className={`transition-colors duration-300 ${sealActive ? "text-rose-500" : "text-zinc-300"}`}>
          {sealActive ? <HUnlock className="w-4 h-4" /> : <HLock className="w-4 h-4" />}
        </span>
      </motion.div>

      <Connector active={phase === 2} />

      {/* Device B — recovered */}
      <motion.div
        className={`rounded-2xl border px-4 py-3 transition-colors duration-500 ${
          recovered
            ? "border-emerald-200 bg-white shadow-[inset_0_0_0_1px_rgba(16,185,129,0.12)]"
            : "border-dashed border-zinc-200 bg-zinc-50"
        }`}
        animate={recovered ? { scale: [0.97, 1] } : { scale: 1 }}
        transition={{ ...SPRING }}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className={`w-1 h-4 rounded-full transition-colors duration-500 ${recovered ? "bg-emerald-400" : "bg-zinc-200"}`} />
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-[0.15em]">Any browser</span>
          </div>
          {recovered ? (
            <span className="text-[9px] font-mono text-emerald-600 tracking-wide">RECOVERED</span>
          ) : (
            <span className="text-[9px] font-mono text-zinc-400">awaiting…</span>
          )}
        </div>

        {recovered ? (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="font-mono text-base font-bold text-emerald-700 tracking-tight">5.0 SUI recovered</div>
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="text-[9px] font-mono text-blue-700">same wallet · zkLogin</span>
            </div>
          </motion.div>
        ) : (
          <div className="font-mono text-base font-bold text-zinc-300 tracking-[0.2em] select-none">———</div>
        )}
      </motion.div>

      {/* Caption */}
      <p className="pt-3 text-center text-[9px] font-mono text-zinc-400 tracking-[0.15em] uppercase">
        <span className="text-cyan-600">Walrus</span> · <span className="text-rose-500">Seal</span> · <span className="text-blue-600">zkLogin</span>
      </p>

    </div>
  );
}
