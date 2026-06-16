"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { UmbraTerminal } from "@/app/components/UmbraTerminal";

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  }),
};

export default function UmbraPage() {
  return (
    <motion.main
      className="relative min-h-screen overflow-hidden bg-white text-zinc-900"
      style={{
        backgroundImage:
          "linear-gradient(to right,rgba(0,0,0,0.04) 1px,transparent 1px)," +
          "linear-gradient(to bottom,rgba(0,0,0,0.04) 1px,transparent 1px)",
        backgroundSize: "40px 40px",
      }}
      animate={{
        backgroundPosition: ["0px 0px", "18px 8px", "8px 18px", "-8px 12px", "0px 0px"],
      }}
      transition={{ duration: 18, ease: "easeInOut", repeat: Infinity, repeatType: "loop" }}
    >
      {/* soft blue spotlight — gives the grid depth without hiding it */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(37,99,235,0.08), transparent 70%)",
        }}
      />
      {/* fade the grid out toward the bottom so it never competes with content */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white" />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24 space-y-12">
        <header className="space-y-4">
          <motion.div variants={fadeUp} custom={0} initial="hidden" animate="visible">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.07] bg-white/70 backdrop-blur px-3 py-1 text-[11px] font-mono uppercase tracking-wide text-zinc-500 hover:text-zinc-900 hover:border-black/15 transition-colors"
            >
              ← FairDrop
            </Link>
          </motion.div>

          <motion.span
            variants={fadeUp}
            custom={1}
            initial="hidden"
            animate="visible"
            className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 backdrop-blur px-3 py-1 text-[11px] font-semibold text-blue-700"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
            </span>
            Live on testnet · MEV-proof settlement
          </motion.span>

          <motion.div
            variants={fadeUp}
            custom={2}
            initial="hidden"
            animate="visible"
            className="flex items-center gap-3"
          >
            <h1 className="text-4xl sm:text-6xl font-bold tracking-[-0.03em] text-transparent bg-clip-text bg-gradient-to-b from-zinc-900 to-zinc-600">
              Umbra
            </h1>
            <span className="text-[10px] font-mono uppercase tracking-widest rounded-full px-2.5 py-1 border border-blue-500/30 bg-blue-50 text-blue-600">
              testnet
            </span>
          </motion.div>

          <motion.p
            variants={fadeUp}
            custom={3}
            initial="hidden"
            animate="visible"
            className="text-zinc-600 max-w-2xl leading-relaxed"
          >
            Confidential, MEV-proof settlement. Your order is a 32-byte hash until it&apos;s too
            late to attack, then the batch clears at one fair price in randomized order.
            Same commit-reveal + Seal + Walrus + <span className="font-mono text-zinc-800">sui::random</span> engine as
            FairDrop — re-aimed from fair launches to front-running.
          </motion.p>
        </header>

        <motion.div variants={fadeUp} custom={4} initial="hidden" animate="visible">
          <UmbraTerminal />
        </motion.div>

        <motion.footer
          variants={fadeUp}
          custom={5}
          initial="hidden"
          animate="visible"
          className="border-t border-black/[0.07] pt-6 text-[11px] font-mono text-zinc-600 leading-relaxed"
        >
          <p>No backend · no admin key · order nonce Seal-encrypted &amp; recoverable from Walrus.</p>
          <p className="mt-1">The left panel is a documented sandwich; the right panel is a live on-chain Umbra order.</p>
        </motion.footer>
      </div>
    </motion.main>
  );
}
