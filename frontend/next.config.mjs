/** @type {import('next').NextConfig} */
// COOP header removed: Enoki's zkLogin popup flow has the opener poll
// popup.location.hash / window.closed; a non-default COOP (same-origin-allow-popups)
// severed that cross-window access after the cross-origin Google hop, blocking the
// callback (error at @mysten/enoki wallet.mjs:246). Default (unsafe-none) restores it.
const nextConfig = {};

export default nextConfig;
