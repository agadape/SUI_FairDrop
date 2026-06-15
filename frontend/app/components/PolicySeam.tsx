"use client";

import { motion } from "framer-motion";

// ── The Option B seam ────────────────────────────────────────────────────────
// Shown at the recovery moment. The decryption a judge just watched was gated by
// a REAL on-chain Move function — fairdrop::seal_policy::seal_approve — already
// deployed in this package. The auction is one policy over a recoverable,
// on-chain-governed secret. Swap the asserts and the same primitive becomes a
// sealed vote, a sealed RFP bid, or a time-lock. We show the seam in code; we do
// not pitch a platform.

const REAL_POLICY = `module fairdrop::seal_policy {
  // Seal asks the chain: may THIS caller decrypt? The key
  // servers run this as a dry-run before releasing the key.
  public fun seal_approve(
    id: vector<u8>, entry: &Entry,
    auction: &Auction, clock: &Clock, _ctx: &mut TxContext,
  ) {
    // 1. the ciphertext is bound to THIS auction
    assert!(id == auction_id_bytes(auction), 0);
    // 2. the caller owns an Entry for it (zkLogin-gated)
    assert!(entry_auction_id(entry) == object::id(auction), 1);
    // 3. ...and only while the reveal window is open
    assert!(now(clock) < reveal_end_ms(auction), 2);
  }
}`;

const SWAPS: { label: string; line: string }[] = [
  { label: "Sealed governance vote", line: "assert!(is_member(entry) && now < tally_start);" },
  { label: "Sealed RFP / procurement bid", line: "assert!(is_supplier(entry) && now < rfp_close);" },
  { label: "Dead-man / time-lock release", line: "assert!(now >= unlock_ms);" },
];

export function PolicySeam() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      className="rounded-md border border-zinc-200 bg-white p-5 sm:p-6 space-y-5"
    >
      <div className="space-y-1">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
          What just happened, underneath
        </p>
        <h3 className="text-lg font-bold text-zinc-900">
          The auction is one <span className="text-cyan-700">policy</span>.
        </h3>
        <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl">
          That recovery wasn&apos;t a server handing your bid back. A Seal key server asked the
          chain a question — <span className="text-zinc-200">&ldquo;is this caller allowed?&rdquo;</span> — and ran this
          exact function. No backend. No admin override. Just code anyone can read.
        </p>
      </div>

      {/* The real, deployed policy */}
      <div className="rounded-md border border-zinc-200 bg-zinc-50 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-cyan-500/15">
          <span className="text-[10px] font-mono text-cyan-700">fairdrop::seal_policy — live on-chain</span>
          <span className="text-[10px] font-mono text-emerald-700">✓ gating the decrypt you just saw</span>
        </div>
        <pre className="text-[11px] leading-relaxed font-mono text-zinc-700 px-3 py-3 overflow-x-auto">
          <code>{REAL_POLICY}</code>
        </pre>
      </div>

      {/* Swap the policy → other secrets */}
      <div className="space-y-2">
        <p className="text-[11px] font-mono text-rose-600/90">
          Swap those three asserts → the same recoverable secret becomes:
        </p>
        <div className="space-y-1.5">
          {SWAPS.map((s) => (
            <div
              key={s.label}
              className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
            >
              <span className="text-xs text-zinc-700 font-semibold sm:w-56 flex-shrink-0">{s.label}</span>
              <code className="text-[11px] font-mono text-rose-600/80 break-all">{s.line}</code>
            </div>
          ))}
        </div>
      </div>

      {/* Category close */}
      <p className="text-sm text-zinc-700 leading-relaxed border-t border-zinc-200 pt-4 max-w-2xl">
        Underneath FairDrop is a <span className="text-cyan-700 font-semibold">recoverable, on-chain-governed secret</span> no
        server can read — encrypted by <span className="text-rose-600">Seal</span>, stored on{" "}
        <span className="text-cyan-700">Walrus</span>, openable only by the Entry owner the chain approves.
        The sealed-bid auction is just its first policy.
      </p>
    </motion.section>
  );
}
