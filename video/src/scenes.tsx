import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT, MONO } from "./brand";
import { Caption, ClipSlot, HexLock, Kicker, Logo, useReveal } from "./ui";

// ── Scene 1 · HOOK (0:00–0:30) — dark card, problem → primitive reveal ─────────
export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const l1 = useReveal(8);
  const l2 = useReveal(40);
  const reveal = useReveal(110);
  const lockProgress = interpolate(frame, [150, 260], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill
      style={{ background: COLORS.darkBg, alignItems: "center", justifyContent: "center", padding: 120 }}
    >
      <div style={{ position: "absolute", top: 200, textAlign: "center", maxWidth: 1400 }}>
        <div style={{ fontFamily: FONT, fontSize: 64, fontWeight: 700, color: "#fff", lineHeight: 1.15, ...l1 }}>
          Encrypt a secret on-chain today,
        </div>
        <div style={{ fontFamily: FONT, fontSize: 64, fontWeight: 700, color: COLORS.gray, lineHeight: 1.15, marginTop: 8, ...l2 }}>
          and one lost device means it's gone forever.
        </div>
      </div>
      <div style={{ marginTop: 80 }}>
        <HexLock size={260} progress={lockProgress} />
      </div>
      <div style={{ position: "absolute", bottom: 160, textAlign: "center", ...reveal }}>
        <div style={{ fontFamily: FONT, fontSize: 30, color: COLORS.blue, fontWeight: 600, letterSpacing: 1 }}>
          We removed that rule.
        </div>
        <div style={{ fontFamily: FONT, fontSize: 24, color: "#fff", opacity: 0.7, marginTop: 10 }}>
          A recoverable, on-chain-policy-gated secret no server can read.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Frame for live-footage scenes: kicker chip top-left + the clip filling the frame.
const FootageFrame: React.FC<{ kicker: string; children: React.ReactNode }> = ({ kicker, children }) => (
  <AbsoluteFill style={{ background: COLORS.paper }}>
    <AbsoluteFill style={{ padding: 56 }}>
      <div style={{ flex: 1, borderRadius: 20, overflow: "hidden", border: `1px solid ${COLORS.grayLine}`, boxShadow: "0 30px 80px rgba(0,0,0,0.10)" }}>
        {children}
      </div>
    </AbsoluteFill>
    <div style={{ position: "absolute", top: 84, left: 84 }}>
      <Kicker>{kicker}</Kicker>
    </div>
  </AbsoluteFill>
);

// ── Scene 2 · FAIRDROP + RECOVERY (0:30–1:40) — emotional peak ──────────────────
export const FairDropScene: React.FC<{ clipsReady: boolean }> = ({ clipsReady }) => (
  <FootageFrame kicker="Policy #1 · FairDrop">
    <ClipSlot name="fairdrop.mp4" ready={clipsReady} label="FairDrop: commit → lose device → recover" />
    <Sequence from={30} durationInFrames={180}><Caption>Sealed bid — committed. Invisible to everyone.</Caption></Sequence>
    <Sequence from={600} durationInFrames={180}><Caption>I lose this device.</Caption></Sequence>
    <Sequence from={840} durationInFrames={180}><Caption>Fresh browser · same Google login</Caption></Sequence>
    <Sequence from={1100} durationInFrames={260}><Caption>Walrus → Seal → the chain approves</Caption></Sequence>
    <Sequence from={1500} durationInFrames={500}><Caption accent>Bid recovered. No server ever saw it.</Caption></Sequence>
  </FootageFrame>
);

// ── Scene 3 · RANDOM TIE-BREAK (1:40–2:10) ──────────────────────────────────────
export const TieBreakScene: React.FC<{ clipsReady: boolean }> = ({ clipsReady }) => (
  <FootageFrame kicker="Verifiable resolution">
    <ClipSlot name="tiebreak.mp4" ready={clipsReady} label="Resolve → SuiScan → sui::random 0x8" />
    <Sequence from={30} durationInFrames={200}><Caption>Two bids tie at the clearing price.</Caption></Sequence>
    <Sequence from={300} durationInFrames={250}><Caption>Validator randomness · sui::random @ 0x8</Caption></Sequence>
    <Sequence from={620} durationInFrames={250}><Caption accent>The winner is chosen on-chain. Not by us.</Caption></Sequence>
  </FootageFrame>
);

// ── Scene 4 · THE SEAM (2:10–2:45) — the hero beat ──────────────────────────────
const CODE: { t: string; blue?: boolean; dim?: boolean }[] = [
  { t: "public fun seal_approve(", blue: true },
  { t: "    id: vector<u8>, entry: &Entry," },
  { t: "    auction: &Auction, clock: &Clock," },
  { t: ") {" },
  { t: "    // ciphertext is bound to THIS auction", dim: true },
  { t: "    assert!(id == auction.id_bytes());" },
  { t: "    // caller owns an Entry (zkLogin-gated)", dim: true },
  { t: "    assert!(entry.auction_id == auction.id);" },
  { t: "    // ...only while the reveal window is open", dim: true },
  { t: "    assert!(now < auction.reveal_end_ms);" },
  { t: "}" },
];
const DIFFS = [
  { app: "FairDrop", rule: "Entry owner, during reveal", tag: "LIVE", live: true },
  { app: "Umbra", rule: "Order owner, during reveal", tag: "LIVE", live: true },
  { app: "Voting", rule: "member, before tally", tag: "illustrative", live: false },
  { app: "Inheritance", rule: "anyone, after unlock_time", tag: "illustrative", live: false },
];
export const SeamScene: React.FC = () => {
  const head = useReveal(6);
  return (
    <AbsoluteFill style={{ background: COLORS.paper, padding: 90 }}>
      <div style={{ ...head }}>
        <Kicker>The seam</Kicker>
        <div style={{ fontFamily: FONT, fontSize: 52, fontWeight: 700, color: COLORS.ink, marginTop: 8 }}>
          Same engine. Swap one function.
        </div>
      </div>
      <div style={{ display: "flex", gap: 56, marginTop: 50, flex: 1 }}>
        <div style={{ flex: 1.1, background: "#fff", borderRadius: 18, border: `1px solid ${COLORS.grayLine}`, padding: 40, fontFamily: MONO, fontSize: 25, lineHeight: 1.7 }}>
          {CODE.map((c, i) => {
            const r = useReveal(20 + i * 6, 10);
            return (
              <div key={i} style={{ color: c.dim ? COLORS.gray : c.blue ? COLORS.blue : COLORS.ink, ...r }}>
                {c.t || " "}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18, justifyContent: "center" }}>
          {DIFFS.map((d, i) => {
            const r = useReveal(120 + i * 16, 12);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, background: "#fff", border: `1px solid ${COLORS.grayLine}`, borderRadius: 14, padding: "20px 24px", ...r }}>
                <span style={{ fontFamily: FONT, fontSize: 30, fontWeight: 700, color: COLORS.ink, width: 200 }}>{d.app}</span>
                <span style={{ fontFamily: MONO, fontSize: 22, color: COLORS.gray, flex: 1 }}>{d.rule}</span>
                <span style={{ fontFamily: FONT, fontSize: 16, fontWeight: 700, letterSpacing: 1, color: d.live ? "#fff" : COLORS.gray, background: d.live ? COLORS.blue : COLORS.grayLine, padding: "6px 12px", borderRadius: 999 }}>
                  {d.tag}
                </span>
              </div>
            );
          })}
          <div style={{ fontFamily: FONT, fontSize: 20, color: COLORS.gray, marginTop: 8 }}>
            Two deployed. The others are one assert away — not built.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 5 · UMBRA (2:45–3:15) ─────────────────────────────────────────────────
export const UmbraScene: React.FC<{ clipsReady: boolean }> = ({ clipsReady }) => (
  <FootageFrame kicker="Policy #2 · Umbra">
    <ClipSlot name="umbra.mp4" ready={clipsReady} label="Umbra: Rekt sandwich vs live shielded order" />
    <Sequence from={30} durationInFrames={210}><Caption>A real Cetus sandwich: −$42 extracted.</Caption></Sequence>
    <Sequence from={330} durationInFrames={260}><Caption>Umbra: the order is a 32-byte shadow.</Caption></Sequence>
    <Sequence from={650} durationInFrames={220}><Caption accent>Nothing to front-run. $0 extractable.</Caption></Sequence>
  </FootageFrame>
);

// ── Scene 6 · CLOSE (3:15–5:00) — real-world bookend + final ─────────────────────
export const CloseScene: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: COLORS.paper }}>
      {/* Beat A: real-world statement (0–45s) */}
      <Sequence from={0} durationInFrames={1350}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 160 }}>
          <Statement
            lines={[
              "Every encrypted on-chain secret today is",
              "one lost device from gone forever.",
            ]}
            sub="That's why nothing that matters lives behind on-chain encryption. We fixed the thing blocking the category."
          />
        </AbsoluteFill>
      </Sequence>
      {/* Beat B: one primitive, two policies (45–75s) */}
      <Sequence from={1350} durationInFrames={900}>
        <TwoPolicies />
      </Sequence>
      {/* Beat C: tagline + logo + links (75–105s) */}
      <Sequence from={2250} durationInFrames={900}>
        <FinalCard />
      </Sequence>
    </AbsoluteFill>
  );
};

const Statement: React.FC<{ lines: string[]; sub: string }> = ({ lines, sub }) => {
  const a = useReveal(6);
  const b = useReveal(60);
  return (
    <div style={{ textAlign: "center", maxWidth: 1500 }}>
      <div style={{ ...a }}>
        {lines.map((l, i) => (
          <div key={i} style={{ fontFamily: FONT, fontSize: 66, fontWeight: 700, color: COLORS.ink, lineHeight: 1.18 }}>{l}</div>
        ))}
      </div>
      <div style={{ fontFamily: FONT, fontSize: 28, color: COLORS.gray, marginTop: 36, lineHeight: 1.5, ...b }}>{sub}</div>
    </div>
  );
};

const TwoPolicies: React.FC = () => {
  const head = useReveal(6);
  const cards = [
    { app: "FairDrop", desc: "Sealed-bid fair launch", line: "Never lose access to your bid" },
    { app: "Umbra", desc: "Confidential MEV-proof swap", line: "Orders invisible until too late to attack" },
  ];
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 120 }}>
      <div style={{ textAlign: "center", marginBottom: 60, ...head }}>
        <Kicker>The primitive is the product</Kicker>
        <div style={{ fontFamily: FONT, fontSize: 56, fontWeight: 700, color: COLORS.ink, marginTop: 8 }}>One engine. Two policies.</div>
      </div>
      <div style={{ display: "flex", gap: 40 }}>
        {cards.map((c, i) => {
          const r = useReveal(40 + i * 20, 14);
          return (
            <div key={i} style={{ width: 560, background: "#fff", border: `1px solid ${COLORS.grayLine}`, borderRadius: 20, padding: 48, ...r }}>
              <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 700, color: COLORS.ink }}>{c.app}</div>
              <div style={{ fontFamily: FONT, fontSize: 26, color: COLORS.blue, marginTop: 10, fontWeight: 600 }}>{c.desc}</div>
              <div style={{ fontFamily: FONT, fontSize: 24, color: COLORS.gray, marginTop: 16 }}>{c.line}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const FinalCard: React.FC = () => {
  const a = useReveal(10);
  const b = useReveal(50);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ ...a, marginBottom: 50 }}>
        <Logo size={96} />
      </div>
      <div style={{ textAlign: "center", ...a }}>
        <div style={{ fontFamily: FONT, fontSize: 58, fontWeight: 700, color: COLORS.ink, lineHeight: 1.2 }}>
          Seal made secrets programmable.
        </div>
        <div style={{ fontFamily: FONT, fontSize: 58, fontWeight: 700, color: COLORS.blue, lineHeight: 1.2 }}>
          We made them recoverable.
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 24, color: COLORS.gray, marginTop: 50, ...b }}>
        sui-fairdrop.vercel.app · No backend · No admin key · Sui Overflow 2026
      </div>
    </AbsoluteFill>
  );
};
