# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

FairDrop — fair token/NFT launch protocol on Sui. Hackathon: Sui Overflow 2026. Deadline: June 13, 2026.

**Positioning (frozen):** "A trustless fair-launch auction where you never lose access to your bid."
FairDrop IS a sealed-bid fair-launch protocol; recovery (Seal + Walrus) is its lead differentiator
and demo hook — NOT the product itself. The first fold must always contain both: (1) the category
anchor (auction / fair launch) and (2) the recovery hook.

Three primitives composed: zkLogin (Google-OAuth-gated entry — raises Sybil cost, NOT proof-of-personhood;
do not claim "one human = one entry" or "one Google account = one entry") + commit-reveal bidding (blind bids)
+ `sui::random` (verifiable winner selection). No backend — all state on-chain, ZK proof runs client-side WASM.

Sponsor integrations (maximize prize tracks):
- **Walrus** ($70K track, headline sponsor) — encrypted nonce blobs; `blob_id` stored in `Commitment` on-chain
- **Seal** (built by judge Kostas Chalkias) — threshold encryption of nonce; access policy = `fairdrop::seal_policy` Move module; decryption requires Entry ownership
- **Enoki** (Mysten Labs) — sponsored transactions for `register` + `commit_bid` (gasless for bidder)
- **Pyth** — SUI/USD price feed in bid UI

## Strategy & Scope (Option B — FROZEN)

**Chosen strategy:** the auction is **the proof**, the primitive is **the insight**. FairDrop stays the product; the demo intentionally reveals the recoverable, policy-gated secret primitive underneath it — through concrete evidence already in the code, never through platform claims or vision slides. Category elevation is *earned by showing the seam*, not asserted ("show the seam, don't pitch a platform").

**What FairDrop IS:**
- A working sealed-bid fair-launch auction on Sui you can enter with a Google login and never get locked out of.
- The flagship instance of a primitive already in the code: a **recoverable, on-chain-policy-gated, custodian-blind secret** (`fairdrop::seal_policy::seal_approve` + Seal threshold enc + Walrus storage + zkLogin recovery). The auction = one policy ("Entry owner, during the reveal window").

**What FairDrop is NOT:**
- NOT a platform, SDK, or "recoverable private participation" infrastructure (too abstract, bundles value props — rejected).
- NOT a second product (no sealed-vote/RFP build in the 20-day window — wrong risk/reward).
- NOT "privacy" — commit-reveal is temporary blinding, not privacy; do not claim it.

**Role of the auction:** the concrete, emotional, working demo. Earns trust + top-10 on its own (walletless onboarding + device-loss recovery + verifiable random resolve).

**Role of the primitive reveal:** a ~30-second beat that makes a judge think "the auction is just one policy — they built something general." Delivered via the real `seal_approve` snippet + a short "other policies" list + one closing category line. This is what wins the room.

**One-line anchor:** "FairDrop is a fair launch you can't get locked out of — and underneath it is a recoverable, on-chain-governed secret no server can read; the auction is just its first policy."

**20-day roadmap boundaries:**
- IN: UX-confidence (no "did it work?"), recovery centerpiece, the primitive-reveal beat, demo legibility.
- OUT: protocol/contract changes, a second product, Enoki sponsorship/backend, any feature not serving the demo or the seam.
- **Gate:** every roadmap / UX / positioning change must strengthen Option B, or it is cut.

## Repo Structure

```
contracts/
  sources/
    auction.move        # core auction (built, deployed, 23/23 tests pass)
    seal_policy.move    # Seal access policy (COMPLETE — deployed with package)
  Move.toml
frontend/
  app/
    page.tsx            # landing page — recovery-first hero ("Lose your device. Keep your bid.") + sections
    layout.tsx
    providers.tsx       # dapp-kit + wallet + query client
    globals.css         # theme + glow utilities (incl. glow-cyan Walrus / glow-pink Seal)
    components/
      LiveAuction.tsx   # phase-aware auction UI (LOADING→COMMIT→REVEAL→ENDED→RESOLVED) + recovery flow
      RecoveryHero.tsx  # hero animation: device-loss → Walrus → Seal → recovered
  lib/
    constants.ts        # NETWORK, PACKAGE_ID, AUCTION_ID, CLOCK_ID, RANDOM_ID
    hash.ts             # computeCommitmentHash — sha3_256(amount_le || nonce)
    seal.ts             # Seal threshold encrypt/decrypt + seal_approve tx builder
    walrus.ts           # Walrus blob store/read
    enoki.ts            # Enoki sponsored-tx wrapper (self-sign fallback)
    pyth.ts             # Pyth SUI/USD price feed hook
```

## Commands

### Move Contracts

```bash
# Build
sui move build --path contracts/

# Test (all)
sui move test --path contracts/

# Test (single)
sui move test --path contracts/ <test_name>

# Deploy to testnet
sui client publish --path contracts/ --gas-budget 200000000

# Switch to testnet
sui client switch --env testnet
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # localhost:3000
npm run build      # production build (static export)
npm run lint
```

## Architecture

### On-Chain Objects (Move)

**`Auction` (shared)** — central state. Written by all participants. Contains:
- `registered_nullifiers: Table<vector<u8>, bool>` — nullifier dedup; O(1) check
- `registered_addrs: Table<address, bool>` — per-sender dedup; blocks address reuse even with fresh nullifier
- `commitments: Table<address, vector<u8>>` — bidder → sha3_256 hash only (no amount)
- `reveals: VecMap<address, u64>` — populated during reveal phase; iterated once in `resolve`
- `winners: Table<address, bool>` — populated by resolve; guards reclaim (winners must use claim, not reclaim)
- `proceeds: Coin<SUI>` — populated from winner escrows at resolution

**`Commitment` (owned by bidder)** — contains `escrow: Coin<SUI>` + `blob_id: Option<vector<u8>>` (Walrus blob ID for Seal-encrypted nonce). Critical: `escrow.value >= revealed_amount` enforced at reveal. Refund logic: losers get full escrow back; winners get `escrow - clearing_price` back.

**`Entry` (owned by bidder, no `store`)** — proves registration. Passed as immutable ref to `commit_bid`. One per (nullifier, auction). Cannot be transferred — bound permanently to registrant address.

**`WinnerCertificate` (owned by winner)** — burned on `claim`. Stores `clearing_price`.

**`CreatorCap` (owned by creator)** — authorizes `withdraw_proceeds`. Transferable (supports multisig).

### Auction Phase Flow

```
create_auction → [COMMIT phase] → commit_end_epoch → [REVEAL phase] → reveal_end_epoch → resolve() → claim()
```

Phase gating uses `clock::timestamp_ms` (not epoch — testnet epochs advance fast, millisecond precision needed for demos).

### Resolution Algorithm (`resolve`)

1. Collect all revealed bids from `reveals: VecMap`
2. Sort descending by amount
3. Clearing price = lowest bid where cumulative supply >= total supply
4. Bidders strictly above clearing price = unambiguous winners
5. Bidders exactly at clearing price = randomized via `sui::random::RandomGenerator` (shuffle, take needed count)
6. Mint `WinnerCertificate` to each winner; return escrow to losers atomically in one PTB
7. Set `resolved = true` before first coin transfer (double-resolve guard)

### zkLogin Integration

`register()` takes `nullifier_hash: vector<u8>` computed client-side as `sha3_256(address_bytes || auction_id_bytes)`. Stored in both `registered_nullifiers` (nullifier dedup) and `registered_addrs` (address dedup). zkLogin gates entry behind a Google OAuth login, which **raises the cost** of multi-wallet farming — it is **NOT proof-of-personhood** and NOT enforced on-chain (the nullifier is client-supplied; one person can hold multiple Google accounts). Do not claim "one human = one entry." Second registration from same address or nullifier → `EAlreadyRegistered`.

### Frontend ↔ Contract Interaction

- Phase detection: read `Auction` object via `useSuiClient`, compare timestamps against `commit_end_epoch` / `reveal_end_epoch`
- Nonce: 32-byte random. Primary storage: localStorage. Backup: Seal-encrypted Walrus blob (`blob_id` in Commitment). Reveal flow: read localStorage first; if empty, fetch `Commitment.blob_id` → Walrus read → Seal decrypt.
- Commitment hash: `sha3_256(amount_le_bytes || nonce_bytes)` computed client-side (`lib/hash.ts`)
- ZK proof: handled by Enoki zkLogin (Google login → Enoki `getZkLogin`). Pre-stage logged-in accounts for demo; no live proof generation in the 3-min window.
- Gas: txs are **self-paid** in the MVP. Enoki *sponsorship* (`/v1/transaction-blocks/sponsor`) requires a **private** API key + a server endpoint — incompatible with the no-backend constraint, so the client-side public-key sponsor path returns 403 and cannot work. Fund the demo wallet; do not claim "gasless" unless a server proxy is added.
- **Post-tx state sync (REQUIRED):** after a successful register/commit/reveal tx, the UI MUST advance on its own — poll/retry the object refetch until the new Entry/Commitment/reveal appears. Never require a manual page refresh. (QA found register success does not advance until refresh — see Product Phase.)
- Bid display: show SUI amount + USD equivalent from Pyth SUI/USD price feed

### External Objects & Services

| Object/Service | Address / URL | Purpose |
|---|---|---|
| `Random` | `0x8` | DKG randomness for `resolve` |
| `Clock` | `0x6` | Timestamp phase gating |
| Walrus testnet | `https://aggregator.walrus-testnet.walrus.space` | Encrypted nonce blob storage |
| Seal SDK | `@mysten/seal` | Threshold encryption; access policy = `fairdrop::seal_policy` module |
| Enoki API | `https://api.enoki.mystenlabs.com` | zkLogin auth (nonce / getZkLogin) via **public** key. Sponsorship endpoint needs a **private** key + server → not used in the no-backend MVP (self-pay). |
| Pyth SUI/USD | `@pythnetwork/pyth-sui-js` | Real-time price feed in bid UI |

## Locked Design Decisions

- **Nullifier scope**: auction-specific (`sha3_256(address || auction_id)`), computed client-side; raises Sybil cost via OAuth gating, NOT on-chain proof-of-personhood (honest framing — frozen)
- **Phase enforcement**: timestamp-based (`clock::timestamp_ms`), not epoch-based
- **No-show escrow**: reclaimable via `reclaim_unrevealed` after `reveal_end_epoch`, no penalty
- **Clearing price**: lowest bid where cumulative supply (equal-or-higher bids) >= total supply; tie at margin resolved by `sui::random`
- **Bid currency**: SUI only (no generics, no USDC for MVP)

## Error Codes

```move
EAlreadyRegistered   = 1   // duplicate nullifier
EAlreadyCommitted    = 2   // second commit from same entry
EHashMismatch        = 3   // reveal doesn't match commitment
EPhaseEnded          = 4   // action attempted after phase closed
ETooEarly            = 5   // reveal attempted before commit phase ends
EAlreadyResolved     = 6   // resolve called twice
EBelowMinBid         = 7   // escrow < min_bid
ENotResolved         = 8   // withdraw before resolution
EUnauthorized        = 9   // wrong CreatorCap
EWrongAuction        = 10  // object from different auction
EInsufficientEscrow  = 11  // revealed amount > escrowed amount
EWinnerCannotReclaim = 12  // winner attempted reclaim_escrow instead of claim
```

## Key Constraints

- `resolve` must complete in single PTB; all refunds + winner certs atomic. Tested at 100+ participants.
- Every entry function must check `*.auction_id == auction.id` — no cross-auction object reuse.
- `BidCommitted` event must NOT include amount — only hash. Amount in `BidRevealed` event.
- `resolved = true` set before any coin transfers in `resolve`.
- Move target: < 500 LOC with full test coverage.
- Frontend: **no backend / no server-side secrets** (the recovery + fairness trust story depends on it). Note: `output: 'export'` is NOT currently set (deployed on Vercel serverless; the COOP header was removed to fix the Enoki zkLogin popup) — keep it backend-less regardless.

## Demo Day Priorities

Judges: Andrew Schran (built `sui::random`), Deepak Maram (built zkLogin), Kostas Chalkias (built Seal).
They want their primitives used correctly. Lead demo beat = the recovery centerpiece (frozen positioning). Demo talking points:
- **Hero/centerpiece:** "Lose your device, keep your bid" — clear localStorage / open a fresh browser, recover the sealed bid from Walrus + Seal (Walrus $70K + Chalkias) without trusting the team
- Point to `Random` object `0x8` in Explorer resolve tx; stage a clearing-price tie so randomness visibly fires (Schran)
- zkLogin honest framing: Google-OAuth gating raises Sybil cost, NOT proof-of-personhood / not "one human = one entry" (Maram). Do NOT claim on-chain `ZkLoginVerifiedIssuer` — the nullifier is client-supplied
- Show `blob_id` in Commitment object + the on-chain `seal_approve` policy gating decryption to the Entry owner (Chalkias)
- zkLogin onboarding via Enoki (Google login, no seed phrase) — Mysten Labs audience. (Do NOT claim "gasless/sponsored": client-side sponsorship needs a private key + server, out of scope for the no-backend MVP; the demo wallet self-pays.)
Pre-stage 3 demo accounts at different phases (COMMIT/REVEAL/RESOLVED); pre-load objects before the recovery click. No live ZK proof generation during 3-min demo window. Demo auction config: supply ≥ 1, min_bid ≥ 1 SUI.
Demo experience bar (see Product Phase): every action shows a visible completion state, the UI advances without manual refresh, and the experienced path surfaces a differentiator (recovery and/or live random resolve) — not just register→commit→wait.

## Product Phase: Transaction Confidence & Judge Experience (CURRENT FOCUS — final push)

**Bottleneck shift (post manual-QA, 2026-05-29):** protocol correctness, auth (zkLogin/Google), registration, commit, explorer verification, and the recovery architecture all WORK. The remaining gap is **experience** — the app doesn't communicate progress/completion, so users and judges doubt whether actions worked. The technology is ahead of the UX; this phase closes that gap. **No protocol changes.**

Confirmed QA findings driving this phase:
- Register success does not advance the UI; requires manual refresh ("did it work?").
- Commit completion is a small toast — easy to miss (missed in our own testing).
- No wallet context after login (balance / network / ready-to-transact unknown).
- The strongest differentiator (recovery) is under-communicated by the current UX.
- Core flow can feel like "login → register → commit → wait."

### Backlog (prioritized)
**P0 — must fix before submission** (kill the "did it work?" moment)
- Auto-advance UI on tx success (register/commit/reveal): poll/retry the object refetch until new state appears; never require a manual refresh.
- Loud, unmissable completion state for commit (and register): a focal confirmation (the sealed-bid card *is* the confirmation), not a corner toast.

**P1 — high-value**
- Persistent phase/progress tracker (done ✓ / current / next) so the lifecycle reads as a designed journey.
- Wallet context strip after login: balance + network + ready-to-transact readiness.
- Make recovery experienced/demonstrable in the core flow (surface it; not opt-in only) — the recovery rail / empty-state from the recovery UX spec.
- **Primitive-reveal beat (Option B seam):** at the recovery moment, show the real `seal_approve` policy (~10 lines) + a 3-line "swap the policy → sealed vote / RFP / time-lock" list + the one-line category close. Show the seam in code; never pitch a platform.

**P2 — polish only**
- Copy-address placement, accent-color hierarchy, mobile nav, toast wording, fractional min-bid display formatting.

### Locked UX requirements
- No user action may require a manual refresh to reflect its result.
- Every state-changing tx must produce a visible, focal completion state.
- The demo's experienced path must surface at least one differentiator (recovery and/or live random resolve), not just register→commit→wait.
