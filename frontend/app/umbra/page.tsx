"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { UmbraTerminal } from "@/app/components/UmbraTerminal";

export default function UmbraPage() {
  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-900">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
        <motion.div
          className="rounded-[2rem] sm:rounded-[2.5rem] bg-white border border-black/[0.04] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.06)] p-6 sm:p-10 lg:p-12 space-y-10"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <header className="space-y-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-zinc-500 hover:text-zinc-900 transition-colors"
            >
              ← FairDrop
            </Link>

            {/* badge pill — same language as the hero badge */}
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
              </span>
              Live on testnet · MEV-proof settlement
            </span>

            <div className="flex items-center gap-3">
              <h1 className="text-4xl sm:text-6xl font-bold tracking-[-0.03em] text-transparent bg-clip-text bg-gradient-to-b from-zinc-900 to-zinc-600">
                Umbra
              </h1>
              <span className="text-[10px] font-mono uppercase tracking-widest rounded-full px-2.5 py-1 border border-blue-500/30 bg-blue-50 text-blue-600">
                testnet
              </span>
            </div>

            <p className="text-zinc-500 max-w-2xl leading-relaxed">
              Confidential, MEV-proof settlement. Your order is a 32-byte hash until it&apos;s too
              late to attack, then the batch clears at one fair price in randomized order.
              Same commit-reveal + Seal + Walrus + <span className="font-mono text-zinc-700">sui::random</span> engine as
              FairDrop — re-aimed from fair launches to front-running.
            </p>
          </header>

          <UmbraTerminal />

          <footer className="border-t border-black/[0.06] pt-6 text-[11px] font-mono text-zinc-500 leading-relaxed">
            <p>No backend · no admin key · order nonce Seal-encrypted &amp; recoverable from Walrus.</p>
            <p className="mt-1">The left panel is a documented sandwich; the right panel is a live on-chain Umbra order.</p>
          </footer>
        </motion.div>
      </div>
    </main>
  );
}
