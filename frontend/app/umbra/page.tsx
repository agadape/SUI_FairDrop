"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { UmbraTerminal } from "@/app/components/UmbraTerminal";

export default function UmbraPage() {
  return (
    <motion.main
      className="min-h-screen bg-white text-zinc-900 relative"
      style={{
        backgroundImage:
          "linear-gradient(to right,rgba(0,0,0,0.04) 1px,transparent 1px)," +
          "linear-gradient(to bottom,rgba(0,0,0,0.04) 1px,transparent 1px)",
        backgroundSize: "40px 40px",
      }}
      animate={{
        backgroundPosition: [
          "0px 0px",
          "18px 8px",
          "8px 18px",
          "-8px 12px",
          "0px 0px",
        ],
      }}
      transition={{
        duration: 18,
        ease: "easeInOut",
        repeat: Infinity,
        repeatType: "loop",
      }}
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24 space-y-12">
        <header className="space-y-3">
          <Link href="/" className="text-[11px] font-mono uppercase tracking-wide text-zinc-500 hover:text-zinc-900">← FairDrop</Link>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tighter text-zinc-900">Umbra</h1>
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-1 border border-blue-500/40 text-blue-600">testnet</span>
          </div>
          <p className="text-zinc-600 max-w-2xl leading-relaxed">
            Confidential, MEV-proof settlement. Your order is a 32-byte hash until it&apos;s too
            late to attack, then the batch clears at one fair price in randomized order.
            Same commit-reveal + Seal + Walrus + <span className="font-mono">sui::random</span> engine as
            FairDrop — re-aimed from fair launches to front-running.
          </p>
        </header>

        <UmbraTerminal />

        <footer className="border-t border-zinc-200 pt-6 text-[11px] font-mono text-zinc-600 leading-relaxed">
          <p>No backend · no admin key · order nonce Seal-encrypted &amp; recoverable from Walrus.</p>
          <p className="mt-1">The left panel is a documented sandwich; the right panel is a live on-chain Umbra order.</p>
        </footer>
      </div>
    </motion.main>
  );
}
