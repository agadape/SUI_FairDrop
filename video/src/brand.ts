// FairDrop + Umbra brand tokens — match the frozen light-mode site + logo.
export const COLORS = {
  paper: "#FAFAFA",
  ink: "#0A0A0A",
  blue: "#2563EB",
  gray: "#71717A",
  grayLine: "#E4E4E7",
  darkBg: "#09090B", // problem/hook card (dark→light contrast trick)
};

export const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif';
export const MONO = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

export const FPS = 30;

// Scene lengths in frames (@30fps). Sum = 9000 = 5:00.
export const SCENES = {
  hook: 900, // 0:00–0:30
  fairdrop: 2100, // 0:30–1:40  (happy path + device-loss recovery = peak)
  tiebreak: 900, // 1:40–2:10  (sui::random 0x8)
  seam: 1050, // 2:10–2:45  (seal_approve + policy diff)
  umbra: 900, // 2:45–3:15  (Rekt vs Shield)
  close: 3150, // 3:15–5:00  (real-world bookend + close)
};
export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0);
