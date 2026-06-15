"use client";

import { motion } from "framer-motion";

// ── Inline icon set (matches the rest of the app — crisp stroke SVGs) ─────────
function Icon({ d, className = "w-5 h-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const IUser = (p: { className?: string }) => <Icon className={p.className} d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />;
const ILock = (p: { className?: string }) => <Icon className={p.className} d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" />;
const IDatabase = (p: { className?: string }) => <Icon className={p.className} d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />;
const ICube = (p: { className?: string }) => <Icon className={p.className} d="M12 2 3 7v10l9 5 9-5V7l-9-5zM3 7l9 5 9-5M12 12v10" />;
const IArrowRight = (p: { className?: string }) => <Icon className={p.className} d="M5 12h14m-6-6 6 6-6 6" />;
const IRefresh = (p: { className?: string }) => <Icon className={p.className} d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />;

type Tone = "blue" | "rose" | "cyan" | "emerald";
const CHIP: Record<Tone, string> = {
  blue:    "bg-blue-50 border-blue-200 text-blue-600",
  rose:    "bg-rose-50 border-rose-200 text-rose-600",
  cyan:    "bg-cyan-50 border-cyan-200 text-cyan-600",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-600",
};

const NODES: {
  zone: string;
  title: string;
  tag: string;
  desc: string;
  tone: Tone;
  icon: (p: { className?: string }) => React.ReactElement;
}[] = [
  {
    zone: "① User action",
    title: "zkLogin",
    tag: "Enoki",
    tone: "blue",
    icon: IUser,
    desc: "Sign in with Google — walletless. The same login re-derives the same wallet on any device.",
  },
  {
    zone: "② Key server",
    title: "Seal",
    tag: "threshold t=2",
    tone: "rose",
    icon: ILock,
    desc: "Encrypts the nonce; an on-chain seal_approve policy releases the key — owner only, reveal window only.",
  },
  {
    zone: "③ Off-chain storage",
    title: "Walrus",
    tag: "blob_id on-chain",
    tone: "cyan",
    icon: IDatabase,
    desc: "Stores the encrypted nonce as a blob. Survives device loss — no team server ever holds it.",
  },
  {
    zone: "④ On-chain settlement",
    title: "Sui",
    tag: "PTB · 0x8",
    tone: "emerald",
    icon: ICube,
    desc: "Commit-reveal hides amounts; sui::random 0x8 selects winners; one PTB clears at a uniform price.",
  },
];

function NodeCard({ node }: { node: (typeof NODES)[number] }) {
  const Glyph = node.icon;
  return (
    <div className="flex flex-col h-full border border-zinc-200 bg-white p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span
          className={`grid place-items-center w-9 h-9 rounded-md border flex-shrink-0 ${CHIP[node.tone]}`}
        >
          <Glyph className="w-5 h-5" />
        </span>
        <p className="font-mono text-[10px] text-zinc-400 uppercase tracking-[0.15em] leading-tight">
          {node.zone}
        </p>
      </div>
      <p className="text-sm font-bold text-zinc-900 leading-tight mb-1">{node.title}</p>
      <p className="text-[12px] leading-relaxed text-zinc-600 flex-1">{node.desc}</p>
      <p className="mt-3 inline-block text-[10px] font-mono text-zinc-500 border border-zinc-200 rounded px-1.5 py-0.5 self-start">
        {node.tag}
      </p>
    </div>
  );
}

export function ArchitectureFlow() {
  // Build desktop grid items: node, arrow, node, arrow, node, arrow, node
  const desktopItems = NODES.flatMap((node, i) => {
    const card = (
      <div key={node.title} className="self-stretch">
        <NodeCard node={node} />
      </div>
    );
    if (i < NODES.length - 1) {
      return [
        card,
        <div
          key={`arrow-${i}`}
          className="self-center flex items-center justify-center text-zinc-300"
        >
          <IArrowRight className="w-5 h-5" />
        </div>,
      ];
    }
    return [card];
  });

  return (
    <section id="architecture" className="py-24 border-t border-zinc-200">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-[0.2em] mb-3">
            Architecture
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 mb-3">
            One primitive. Two applications.
          </h2>
          <p className="text-zinc-600 mb-10 max-w-2xl leading-relaxed">
            A recoverable, on-chain-policy-gated secret no server can read. FairDrop and Umbra
            are the same engine — they only swap the access policy.
          </p>
        </motion.div>

        {/* Happy path label */}
        <div className="flex items-center gap-2 mb-3">
          <span className="h-px w-6 bg-zinc-900" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-900">
            Submit (happy path)
          </span>
        </div>

        {/* Desktop: CSS grid with explicit column template */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          {/* Desktop grid — hidden on mobile */}
          <div
            className="hidden sm:grid items-stretch"
            style={{ gridTemplateColumns: "1fr 36px 1fr 36px 1fr 36px 1fr" }}
          >
            {desktopItems}
          </div>

          {/* Mobile stack — shown only on small screens */}
          <div className="flex flex-col sm:hidden">
            {NODES.map((node, i) => (
              <div key={node.title}>
                <NodeCard node={node} />
                {i < NODES.length - 1 && (
                  <div className="flex justify-center py-1">
                    <div className="w-px h-5 bg-zinc-200" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recovery path label */}
        <div className="flex items-center gap-2 mt-8 mb-3">
          <span className="h-px w-6 border-t border-dashed border-zinc-400" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-zinc-500">
            Lose your device (recovery path)
          </span>
        </div>

        {/* Recovery path panel */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="border border-dashed border-zinc-300 bg-zinc-50 p-5 sm:p-6"
        >
          <div className="flex items-start gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-md border border-zinc-300 bg-white text-zinc-700 flex-shrink-0">
              <IRefresh className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-zinc-900">Device lost · localStorage cleared</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 text-[12px] font-mono">
                {[
                  "read blob from Walrus",
                  "Seal runs seal_approve — owner only",
                  "key released → decrypt nonce",
                  "restore & reveal on-chain",
                ].map((step, i, arr) => (
                  <span key={step} className="flex items-center gap-2">
                    <span className="text-zinc-700 border border-zinc-200 bg-white rounded px-2 py-1">
                      {step}
                    </span>
                    {i < arr.length - 1 && (
                      <span className="text-zinc-400 select-none">&rarr;</span>
                    )}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-zinc-600">
                No backend, no team key — the chain itself authorizes the decrypt.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-mono text-zinc-500">
          <span className="flex items-center gap-2">
            <span className="h-px w-5 bg-zinc-900 inline-block" /> submit
          </span>
          <span className="flex items-center gap-2">
            <span className="h-px w-5 border-t border-dashed border-zinc-400 inline-block" /> recovery
          </span>
          <span className="text-zinc-400">
            FairDrop policy:{" "}
            <span className="text-zinc-700">Entry owner, during reveal</span>
          </span>
          <span className="text-zinc-400">
            Umbra policy:{" "}
            <span className="text-zinc-700">order owner, during reveal</span>
          </span>
        </div>
      </div>
    </section>
  );
}
