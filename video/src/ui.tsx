import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  OffthreadVideo,
  staticFile,
  Img,
} from "remotion";
import { COLORS, FONT, MONO } from "./brand";

// Fade+rise in, hold, fade out — used everywhere for smooth easing.
export const useReveal = (delay = 0, dur = 18) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, durationInFrames: dur, config: { damping: 200 } });
  const opacity = interpolate(s, [0, 1], [0, 1]);
  const y = interpolate(s, [0, 1], [18, 0]);
  return { opacity, transform: `translateY(${y}px)` };
};

// Muted-legibility caption — every recovery beat needs one (locked rule).
export const Caption: React.FC<{ children: React.ReactNode; accent?: boolean }> = ({
  children,
  accent,
}) => {
  const r = useReveal(2, 12);
  return (
    <div
      style={{
        position: "absolute",
        bottom: 90,
        left: 0,
        right: 0,
        textAlign: "center",
        ...r,
      }}
    >
      <span
        style={{
          fontFamily: FONT,
          fontSize: 40,
          fontWeight: 600,
          color: "#fff",
          background: accent ? COLORS.blue : "rgba(9,9,11,0.88)",
          padding: "14px 28px",
          borderRadius: 14,
          letterSpacing: -0.5,
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        }}
      >
        {children}
      </span>
    </div>
  );
};

export const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontFamily: FONT,
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: 4,
      textTransform: "uppercase",
      color: COLORS.blue,
    }}
  >
    {children}
  </div>
);

// Interlocking-hexagons lock from the logo. progress 0..1 lights the keyhole + arc.
export const HexLock: React.FC<{ size?: number; progress?: number }> = ({
  size = 280,
  progress = 1,
}) => {
  const glow = interpolate(progress, [0, 1], [0, 1]);
  return (
    <svg width={size} height={size} viewBox="0 0 320 320" fill="none">
      <path
        d="M110 150 L70 173 V219 Q70 265 110 288 M210 150 L250 173 V219"
        stroke={COLORS.ink}
        strokeWidth={10}
        strokeDasharray="220"
        strokeDashoffset={interpolate(progress, [0, 1], [220, 0])}
        strokeLinecap="round"
      />
      {/* shackle arc */}
      <path
        d="M120 150 V120 a40 40 0 0 1 80 0 V150"
        stroke={COLORS.ink}
        strokeWidth={10}
        fill="none"
      />
      {/* two interlocking hexagons */}
      <polygon
        points="120,160 150,178 150,214 120,232 90,214 90,178"
        stroke={COLORS.ink}
        strokeWidth={9}
        fill="none"
      />
      <polygon
        points="200,160 230,178 230,214 200,232 170,214 170,178"
        stroke={COLORS.ink}
        strokeWidth={9}
        fill="none"
      />
      {/* keyhole */}
      <g opacity={glow}>
        <circle cx="160" cy="196" r="14" fill={COLORS.blue} />
        <rect x="153" y="200" width="14" height="26" rx="3" fill={COLORS.blue} />
        <circle cx="160" cy="196" r="30" fill={COLORS.blue} opacity={0.25 * glow} />
      </g>
    </svg>
  );
};

// Live screen-recording slot. Drop file at public/clips/<name>. Until then a slate shows,
// so the whole video still renders. Flip CLIPS_READY in Video.tsx when recordings exist.
export const ClipSlot: React.FC<{
  name: string;
  ready: boolean;
  label: string;
}> = ({ name, ready, label }) => {
  if (ready) {
    return (
      <OffthreadVideo
        src={staticFile(`clips/${name}`)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
  return (
    <AbsoluteFill
      style={{
        background: COLORS.paper,
        alignItems: "center",
        justifyContent: "center",
        border: `2px dashed ${COLORS.grayLine}`,
      }}
    >
      <div style={{ textAlign: "center", fontFamily: MONO, color: COLORS.gray }}>
        <div style={{ fontSize: 26, color: COLORS.ink, marginBottom: 10 }}>● REC SLOT</div>
        <div style={{ fontSize: 38, color: COLORS.ink, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 20, marginTop: 12 }}>public/clips/{name}</div>
      </div>
    </AbsoluteFill>
  );
};

export const Logo: React.FC<{ size?: number }> = ({ size = 64 }) => (
  <Img src={staticFile("logo.png")} style={{ width: size, height: size, borderRadius: 12 }} />
);
