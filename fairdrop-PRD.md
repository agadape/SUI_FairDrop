# FairDrop — Product Requirements Document

**Version**: 1.0
**Date**: 2026-05-26
**Status**: Draft
**Hackathon**: Sui Overflow 2026
**Track**: DeFi & Payments — $30,000 first prize
**Submission Deadline**: June 13, 2026
**Demo Day**: June 13–14, 2026

---

## 1. Executive Summary

FairDrop is a fair token and NFT launch protocol on Sui that makes rigged launches cryptographically impossible. It combines zkLogin (one Google account = one entry), commit-reveal bidding (nobody sees bids until the reveal phase), and Sui's native DKG-based randomness (verifiably unrigged winner selection) — three problems solved in one atomic protocol. Token launches today hemorrhage value to bots, MEV extractors, and insiders; FairDrop makes all three attack vectors structurally impossible, not just policy-prohibited.

---

## 2. Problem Statement

### 2.1 The Core Problem

Token and NFT launches are systematically gamed at three layers simultaneously. **Sybil bots**: a single actor creates hundreds of wallets and sweeps allocation (in the Arbitrum airdrop, ~150,000 Sybil addresses drained ~40% of supply; 1,000 wallets cost under $50 in gas vs. $50,000+ expected return). **Frontrunning/MEV**: visible mempool bids let validators and searchers set bids just above clearing price ($120M+ extracted from NFT mints on Ethereum in 2022). **Rigged randomness**: launches using block hashes or centralized oracles for winner selection have repeatedly been exposed for insider pre-selection.

### 2.2 Why Existing Solutions Fail

| Existing Solution | What it does | Why it fails for this use case |
|---|---|---|
| Allowlist/whitelist | Curated address list | Bots get on lists too; curation is gameable by insiders |
| KYC / off-chain identity | ID verification before wallet | Privacy-invasive, high friction, not verifiable on-chain |
| FCFS | First N txs win | Maximizes MEV; gas wars punish retail; bots always win |
| Dutch auction | Price drops until sold | Visible bids enable frontrunning; no Sybil protection |
| Chainlink VRF | External oracle randomness | Adds trusted third party; oracle bribing possible |
| CAPTCHA | Heuristic filtering | Bypassable with $0.001/solve farms; not on-chain verifiable |

### 2.3 Why Now (Timing Thesis)

Three Sui primitives became production-ready in the past six months: (1) **`sui::random`** — DKG-based verifiable randomness backed by the full validator set, shipped to mainnet by Andrew Schran, not available 12 months ago. (2) **zkLogin** — Google OAuth identity provable on-chain via Groth16 ZK proof, built by Deepak Maram, now production-stable. (3) **Sui's parallel execution model** — owned objects let hundreds of bidders commit simultaneously without contention. FairDrop is three well-understood techniques composed for the first time into a single launch protocol.

---

## 3. Solution

### 3.1 What We're Building

FairDrop is an on-chain launch protocol: creator deploys an `Auction` shared object; participants register once via Google zkLogin (one entry per OAuth nullifier, enforced on-chain); submit bid commitments during a blind commit phase (`sha3_256(amount + nonce)`, no amounts visible); reveal bids during the reveal phase (contract verifies hash match); at resolution, `sui::random` selects winners at uniform clearing price and instantly refunds losers — all in a single on-chain transaction, no backend required.

### 3.2 Key Value Propositions

- One human = one entry: zkLogin nullifier stored on-chain; second registrations from the same Google account structurally rejected.
- Blind bidding eliminates frontrunning: no validator, searcher, or insider can see bid amounts during the commit phase.
- Verifiably fair winner selection: Sui DKG randomness requires 67%+ validator collusion to manipulate — same threshold as consensus safety.
- Instant atomic settlement: winners and losers settle in one transaction; no multi-step claims for refunds.
- No backend: entire protocol is Move contracts + static Next.js frontend.

### 3.3 Explicit Non-Goals

- Secondary market / trading
- Non-Google OAuth providers (Twitter, Apple, GitHub) — requires separate circuit setup
- Token vesting / lockup schedules — separate concern for deploying project
- Creator analytics dashboard
- Cross-chain / bridge
- Auction types beyond uniform clearing price (no Dutch, no reserve price)

---

## 4. Users

### 4.1 Primary User Personas

**The Retail Bidder (primary)**
- Who they are: A retail crypto user who has repeatedly lost token/NFT launches to bots and gas wars.
- Their current workaround: Gas alerts, waking up at 3am, still losing to bots in the first block — or buying on secondary at 5x.
- What they gain: One guaranteed fair entry per person, no gas war, private bid during competition, instant refund if they don't win.

**The Launch Creator (secondary)**
- Who they are: A token project or NFT artist who wants fair distribution but lacks engineering resources for a custom fair-launch mechanism.
- Their current workaround: FCFS Candy Machine clones, manually curated allowlists, or launch platforms that still get bot-gamed.
- What they gain: Deploy-once, zero-backend launch with cryptographic guarantees; reduced community toxicity from perceived rigging.

**The Hackathon Judge (implicit)**
- Who they are: Andrew Schran (built Sui randomness), Deepak Maram (built zkLogin), Kostas Chalkias (built Seal/cryptography).
- What they want: Their primitives used correctly, composed in a novel way, with production-quality Move code.

### 4.2 User Stories (must-have)

- *As a bidder, I want to register with my Google account so I can prove I am a unique human without revealing my identity.* 🔴 Critical
- *As a bidder, I want to submit a hidden bid so validators cannot see my bid amount before the reveal phase.* 🔴 Critical
- *As a bidder, I want to reveal my bid during the reveal phase so the contract can verify it matches my commitment.* 🔴 Critical
- *As a bidder, I want an instant refund if I don't win so my funds are never locked.* 🔴 Critical
- *As a bidder, I want to see auction status (phase, time remaining, participant count) so I know when to act.* 🟡 Important
- *As a bidder, I want to receive my allocation automatically at resolution so I don't need to manually claim.* 🟡 Important
- *As a creator, I want to deploy an auction with configurable supply and timing so I can customize my launch.* 🔴 Critical
- *As a creator, I want the protocol to handle all settlement automatically so I don't need any backend.* 🔴 Critical
- *As the protocol, I must reject second registrations from the same zkLogin nullifier.* 🔴 Critical
- *As the protocol, I must use Sui native randomness for winner selection.* 🔴 Critical

### 4.3 Happy Path (end-to-end user journey)

1. Creator calls `create_auction(supply, min_bid, commit_end_epoch, reveal_end_epoch)` — shared `Auction` object created; creator receives `CreatorCap`.
2. Bidder navigates to frontend with auction object ID in URL. Frontend fetches `Auction` state via RPC. Shows phase: COMMIT, time remaining, supply.
3. Bidder clicks "Sign in with Google." OAuth flow → JWT returned. Frontend generates ephemeral keypair, computes Groth16 ZK proof (~1–3s in WASM).
4. Frontend calls `register(zk_proof, auction_id)` via Enoki sponsored transaction (zero gas for bidder). Contract verifies proof, extracts nullifier, checks no duplicate, mints `Entry` to bidder address.
5. Bidder types bid amount (Pyth SUI/USD feed converts to USD display). Frontend generates 32-byte random nonce. Computes `sha3_256(amount_le_bytes || nonce_bytes)`. Stores nonce in localStorage.
6. Frontend Seal-encrypts nonce (access policy: Entry ownership), uploads ciphertext to Walrus, gets back `blob_id`. Frontend calls `commit_bid(auction_id, &Entry, commitment_hash, Coin<SUI>, blob_id)` via Enoki gasless tx. Contract stores hash + blob_id; escrowed coin locked inside `Commitment` owned object.
7. Commit phase ends (`commit_end_epoch` reached). Frontend shows "REVEAL phase."
8. Bidder clicks "Reveal." Frontend reads nonce from localStorage; if absent, fetches `Commitment.blob_id`, calls Seal SDK to decrypt using bidder's Entry object ownership, restores nonce. Calls `reveal_bid(auction_id, amount, nonce)`. Contract recomputes hash, verifies match, records amount.
9. Reveal phase ends. Any user calls `resolve(auction_id, &Random)`. Contract sorts reveals, determines clearing price, uses `RandomGenerator` for tie-breaking, mints `WinnerCertificate` to winners, auto-refunds losers.
10. Winner calls `claim(certificate, auction_id)` to receive token/NFT allocation.
11. Creator calls `withdraw_proceeds(auction_id, &CreatorCap)` to receive `clearing_price × winner_count` SUI.

---

## 5. Functional Requirements

### 5.1 MVP Features (must ship for submission)

**F-1: Auction Creation**
- Description: Creator deploys parameterized auction as a shared Sui object.
- Input: `supply: u64`, `min_bid: u64` (MIST), `commit_end_epoch: u64`, `reveal_end_epoch: u64`. Creator is tx signer.
- Output: Shared `Auction` object on-chain. `AuctionCreated` event. `CreatorCap` owned by creator.
- Acceptance criteria: `Auction` object exists with correct fields; `CreatorCap` owned by creator; `reveal_end_epoch > commit_end_epoch > current_epoch`.

**F-2: zkLogin Registration (one entry per Google account)**
- Description: Bidder proves Google OAuth identity on-chain; contract mints one `Entry` per unique nullifier.
- Input: Valid `ZkLoginVerifiedIssuer` proof for current epoch, `auction_id`.
- Output: `Entry` owned object minted to bidder. Nullifier recorded in `Auction.registered_nullifiers`.
- Acceptance criteria: (a) valid proof → `Entry` minted; (b) same nullifier second call → `EAlreadyRegistered`; (c) wrong-epoch proof → `EInvalidProof`.

**F-3: Blind Bid Commitment**
- Description: Bidder with valid `Entry` locks funds and submits `sha3_256(amount_le_bytes || nonce_bytes)`.
- Input: `auction_id`, `&Entry`, `commitment: vector<u8>` (32 bytes), `Coin<SUI>` escrow ≥ min_bid.
- Output: `Commitment` owned object with commitment hash and escrowed coin. No amount on-chain.
- Acceptance criteria: (a) commitment stored with no amount field; (b) second commit from same entry → `EAlreadyCommitted`; (c) commit after `commit_end_epoch` → `EPhaseEnded`; (d) escrow < min_bid → `EBelowMinBid`.

**F-4: Bid Reveal**
- Description: Bidder reveals plaintext bid; contract verifies hash match.
- Input: `auction_id`, `&Commitment`, `amount: u64`, `nonce: vector<u8>`.
- Output: Revealed amount recorded in `Auction.reveals`. `BidRevealed` event emitted.
- Acceptance criteria: (a) hash match → reveal accepted; (b) hash mismatch → `EHashMismatch`; (c) reveal after `reveal_end_epoch` → `EPhaseEnded`; (d) reveal before `commit_end_epoch` → `ETooEarly`.

**F-5: Randomness-Based Resolution**
- Description: After reveal phase, any caller triggers resolution using `sui::random::RandomGenerator` for tie-breaking.
- Input: `auction_id`, `&Random` (0x8), `&Clock`.
- Output: Each winner receives `WinnerCertificate`. Each loser's escrowed coin returned to their address. `AuctionResolved` event with clearing price and winner count.
- Acceptance criteria: (a) oversubscribed → exactly `supply` winners; (b) clearing price = lowest winning bid; (c) marginal tie resolved via randomness; (d) all loser escrows returned atomically; (e) double-resolve → `EAlreadyResolved`.

**F-6: Winner Claim**
- Description: Winner redeems `WinnerCertificate` for token/NFT. Certificate burned.
- Input: `WinnerCertificate` (consumed), `auction_id`.
- Output: Token `Coin<T>` or NFT transferred to winner.
- Acceptance criteria: (a) valid certificate → token transferred and certificate burned; (b) wrong auction certificate → `EWrongAuction`.

**F-7: Creator Proceeds Withdrawal**
- Description: Creator withdraws proceeds after resolution.
- Input: `&CreatorCap`, `auction_id`.
- Output: `Coin<SUI>` (clearing_price × winner_count) to creator.
- Acceptance criteria: (a) post-resolution → proceeds transferred; (b) pre-resolution → `ENotResolved`; (c) wrong cap → `EUnauthorized`.

**F-8: Next.js Frontend (demo-quality)**
- Description: Single-page app driving all on-chain interactions — Google login, commit form, reveal form, resolution trigger, claim button.
- Input: Auction object ID in URL.
- Output: Full happy path executable on testnet without CLI.
- Acceptance criteria: Steps 2–11 of happy path completable by a judge on Chrome without CLI access.

**F-9: Walrus + Seal Encrypted Nonce Backup**
- Description: On commit, encrypt the bidder's nonce using Seal threshold encryption (access policy: Entry ownership + commit phase active), upload ciphertext to Walrus blob storage, store blob ID on-chain in `Commitment.blob_id`. On reveal, if localStorage is empty, fetch and decrypt nonce from Walrus via Seal SDK — device-independent recovery.
- Input: `nonce: Uint8Array` (32 bytes), bidder's `Entry` object ID (access policy subject), `Commitment` object ID (to store `blob_id`).
- Output: `Commitment.blob_id: Option<vector<u8>>` populated with Walrus blob ID. Bidder can reveal from any device.
- Acceptance criteria: (a) nonce encrypted + uploaded to Walrus on commit; (b) blob_id stored on-chain in Commitment object; (c) reveal flow fetches + decrypts nonce from Walrus when localStorage is empty; (d) wrong-owner access attempt → Seal decryption denied.

**F-10: Enoki Gasless Registration + Commit**
- Description: Wrap `register` and `commit_bid` transactions in Mysten Labs Enoki sponsored transaction flow. Bidder pays zero gas on these two actions — dramatically reduces friction for first-time Sui users.
- Input: Enoki API key (from Mysten Labs developer portal); transaction bytes for `register` and `commit_bid`.
- Output: Transaction submitted with gas sponsored by Enoki; bidder address pays no SUI.
- Acceptance criteria: (a) `register` executes with 0 SUI in bidder wallet; (b) `commit_bid` executes with 0 SUI in bidder wallet (escrow SUI still required); (c) falls back to normal self-sponsored tx if Enoki endpoint unavailable.

### 5.2 Post-MVP Features (explicitly deferred)

- Multi-token bid currency (USDC) — Move generics add complexity; SUI sufficient for demo.
- Auction factory + creator deployment UI — single hardcoded auction sufficient for demo.
- Non-Google zkLogin providers — requires separate circuit setup.
- `reclaim_unrevealed` for no-show bidders — add post-hackathon.
- Sui Display NFT `WinnerCertificate` — cosmetic improvement, deferred if time-constrained.

---

## 6. Non-Functional Requirements

| Requirement | Target | Notes |
|---|---|---|
| Transaction finality | < 500ms | Sui average; no optimistic assumptions |
| ZK proof generation | < 3 seconds client-side | Groth16 WASM; test on mid-range laptop pre-demo |
| Resolution gas (100 participants) | < 50,000,000 MIST (0.05 SUI) | Fits in single PTB; validate before demo |
| Single-tx resolution | Yes | All refunds + winner certs in one PTB |
| Sybil resistance | 1 Google account = 1 entry on-chain | `Table<vector<u8>, bool>` nullifier check |
| Bid privacy | Zero amount leakage during commit phase | No amount field in `Commitment` struct |
| Randomness manipulation threshold | Requires 67%+ validator collusion | Sui DKG guarantee |
| Demo availability | Works end-to-end during 30-min judge session | Tested on testnet; no mocks |
| Commit gas | < 5,000,000 MIST per bid | Single object write + coin lock |
| Reveal gas | < 3,000,000 MIST per reveal | Hash verification + VecMap insert |
| Frontend load | < 2 seconds | Static Next.js; no server round-trip |

---

## 7. Technical Architecture

### 7.1 Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Smart Contract | Move on Sui | Hackathon requirement; Sui object model enables atomic multi-transfer settlement |
| Frontend | Next.js 14 + Tailwind CSS | Fast to build; `@mysten/dapp-kit` has first-class Sui support |
| Backend | None | All state on-chain; ZK proof runs client-side in WASM |
| Storage | Walrus + Seal (encrypted nonce blobs) | Walrus = $70K sponsor track; Seal = threshold encryption by judge Kostas Chalkias |
| Auth | Sui zkLogin (Google OAuth) + Enoki sponsored txs | zkLogin: on-chain identity; Enoki: gasless register/commit, Mysten Labs product |
| Randomness | `sui::random` module (0x8) | Validator-backed DKG; no oracle; available on mainnet and testnet |
| Price Oracle | Pyth Network (SUI/USD feed) | Real-time SUI/USD conversion in bid UI; Pyth is Sui Overflow sponsor |
| Coin | SUI native | Simplest escrow; no generics needed for MVP |

### 7.2 System Architecture

```
BIDDER BROWSER
┌──────────────────────────────────────────────────────┐
│  Next.js (static) ──▶ Google OAuth ──▶ WASM ZK Prover│
│  Enoki SDK (gasless txs) ──▶ Seal SDK (encrypt nonce)│
│  Pyth price feed (SUI/USD display)                    │
└──────┬─────────────────┬──────────────────────┬──────┘
       │ Sui RPC          │ Enoki API             │ Walrus RPC
       ▼                  ▼                       ▼
SUI BLOCKCHAIN      MYSTEN ENOKI          WALRUS NETWORK
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│ fairdrop::   │    │ Sponsored tx │    │ Encrypted nonce  │
│ auction      │    │ gas for      │    │ blobs (Seal      │
│              │    │ register +   │    │ threshold enc.)  │
│ fairdrop::   │    │ commit_bid   │    │ blob_id stored   │
│ seal_policy  │    └──────────────┘    │ in Commitment    │
│              │                        │ on-chain         │
│ 0x8 Random   │    PYTH NETWORK        └──────────────────┘
│ 0x6 Clock    │    ┌──────────────┐
│ ZK Verifier  │    │ SUI/USD price│
└──────────────┘    └──────────────┘
       │ JWT verification
       ▼
  Google OAuth
```

### 7.3 On-Chain vs Off-Chain Split

| Component | On-chain | Off-chain | Reason |
|---|---|---|---|
| zkLogin nullifier registry | `Table<vector<u8>, bool>` | Google account itself | Privacy: nullifier reveals nothing |
| Bid commitment hash | `Commitment` object | — | Trustless: hash proves commitment |
| Bid amount + nonce | `Commitment.blob_id` (Walrus blob ID) | Seal-encrypted Walrus blob + localStorage cache | Privacy: Seal threshold enc; device-independent recovery via F-9 |
| Escrowed bid funds | `Coin<SUI>` inside `Commitment` | — | Trustless: funds locked in owned object |
| Revealed bid amounts | `Auction.reveals` VecMap | — | Required for clearing price calculation |
| Randomness seed | Generated by 0x8 | — | Must be on-chain for verifiability |
| Winner list | Computed in `resolve` tx | — | Trustless: no off-chain list |
| ZK proof computation | Verified by validators | Computed in browser WASM | Verification cheap; computation expensive |

### 7.4 Smart Contract Interfaces (Move)

```move
module fairdrop::auction {
    use sui::object::{Self, ID, UID};
    use sui::tx_context::TxContext;
    use sui::coin::Coin;
    use sui::sui::SUI;
    use sui::random::{Self, Random, RandomGenerator};
    use sui::table::{Self, Table};
    use sui::vec_map::{Self, VecMap};
    use sui::clock::Clock;
    use sui::event;

    // ── Error codes ──────────────────────────────────────────────
    const EAlreadyRegistered: u64 = 1;
    const EAlreadyCommitted:  u64 = 2;
    const EHashMismatch:      u64 = 3;
    const EPhaseEnded:        u64 = 4;
    const ETooEarly:          u64 = 5;
    const EAlreadyResolved:   u64 = 6;
    const EBelowMinBid:       u64 = 7;
    const ENotResolved:       u64 = 8;
    const EUnauthorized:      u64 = 9;
    const EWrongAuction:      u64 = 10;
    const EInsufficientEscrow: u64 = 11;

    // ── Shared State ─────────────────────────────────────────────
    struct Auction has key {
        id: UID,
        creator: address,
        supply: u64,
        min_bid: u64,
        commit_end_epoch: u64,
        reveal_end_epoch: u64,
        registered_nullifiers: Table<vector<u8>, bool>,
        commitments: Table<address, vector<u8>>,  // bidder → hash
        reveals: VecMap<address, u64>,             // bidder → amount
        proceeds: Coin<SUI>,
        resolved: bool,
    }

    // ── Owned Objects ────────────────────────────────────────────
    struct CreatorCap has key, store {
        id: UID,
        auction_id: ID,
    }

    struct Entry has key, store {
        id: UID,
        auction_id: ID,
        nullifier_hash: vector<u8>,
        owner: address,
    }

    struct Commitment has key, store {
        id: UID,
        auction_id: ID,
        bidder: address,
        commitment_hash: vector<u8>,     // sha3_256(amount_le || nonce)
        escrow: Coin<SUI>,               // locked bid funds
        blob_id: Option<vector<u8>>,     // Walrus blob ID for Seal-encrypted nonce
    }

    struct WinnerCertificate has key, store {
        id: UID,
        auction_id: ID,
        winner: address,
        clearing_price: u64,
    }

    // ── Events ───────────────────────────────────────────────────
    struct AuctionCreated  has copy, drop { auction_id: ID, creator: address, supply: u64 }
    struct BidderRegistered has copy, drop { auction_id: ID, bidder: address }
    struct BidCommitted    has copy, drop { auction_id: ID, bidder: address }
    // NOTE: amount NOT in BidCommitted — reveals it before reveal phase
    struct BidRevealed     has copy, drop { auction_id: ID, bidder: address, amount: u64 }
    struct AuctionResolved has copy, drop {
        auction_id: ID, winner_count: u64,
        clearing_price: u64, total_proceeds: u64
    }

    // ── Entry Functions ──────────────────────────────────────────

    public entry fun create_auction(
        supply: u64,
        min_bid: u64,
        commit_end_epoch: u64,
        reveal_end_epoch: u64,
        ctx: &mut TxContext,
    );

    public entry fun register(
        auction: &mut Auction,
        nullifier_hash: vector<u8>,   // sha3_256(google_sub || auction_id)
        ctx: &mut TxContext,
    );

    public entry fun commit_bid(
        auction: &mut Auction,
        entry: &Entry,                 // proves registration; immutable ref
        commitment_hash: vector<u8>,   // sha3_256(amount_le_bytes || nonce)
        escrow: Coin<SUI>,             // must be >= min_bid
        clock: &Clock,
        ctx: &mut TxContext,
    );

    public entry fun reveal_bid(
        auction: &mut Auction,
        commitment: &Commitment,       // immutable ref; not consumed here
        amount: u64,
        nonce: vector<u8>,             // 32 bytes
        clock: &Clock,
        ctx: &mut TxContext,
    );

    // resolve: callable by anyone after reveal_end_epoch
    // Uses &Random (0x8) — Sui native DKG randomness
    public entry fun resolve(
        auction: &mut Auction,
        rand: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    );

    // claim: burns WinnerCertificate, transfers token
    public entry fun claim(
        auction: &mut Auction,
        certificate: WinnerCertificate,  // consumed / burned
        ctx: &mut TxContext,
    );

    public entry fun withdraw_proceeds(
        auction: &mut Auction,
        cap: &CreatorCap,
        ctx: &mut TxContext,
    );

    // reclaim_unrevealed: post-resolve recovery for no-show bidders
    public entry fun reclaim_unrevealed(
        auction: &mut Auction,
        commitment: Commitment,   // consumed; returns escrow
        clock: &Clock,
        ctx: &mut TxContext,
    );
}
```

### 7.5 Key Data Models

**`Auction` (shared object)**: Multiple writers — Sui's shared object locking applies. `registered_nullifiers: Table<vector<u8>, bool>` is O(1) existence check. `commitments: Table<address, vector<u8>>` prevents duplicate commits. `reveals: VecMap<address, u64>` iterated once during `resolve` (bounded by participant count). `proceeds: Coin<SUI>` populated at resolution from winner escrows.

**`Commitment` (owned by bidder)**: Contains `escrow: Coin<SUI>` — actual bid funds. Critical invariant: `escrow.value >= revealed_amount` enforced at reveal time. Refund = `escrow - clearing_price` returned to winner at resolution; full escrow returned to losers. `blob_id: Option<vector<u8>>` stores Walrus blob ID for Seal-encrypted nonce backup (set at commit time, used for cross-device reveal recovery via F-9).

**`Entry` (owned by bidder)**: Immutable reference passed to `commit_bid`. One per (nullifier, auction). Enforced by nullifier Table in Auction.

**`WinnerCertificate` (owned by winner)**: `has key, store` — transferable. `clearing_price` field documents what winner paid. Burned on claim via Move's object deletion.

**`CreatorCap` (owned by creator)**: `has key, store` — transferable. Authorizes `withdraw_proceeds`. Supports multisig creator setups.

### 7.6 External Integrations

| Integration | Specific Functions Used | Fallback if Unavailable |
|---|---|---|
| `sui::random` (0x8) | `random::new_generator(&rand, ctx)`, `generator.generate_u64_in_range(0, n)` | None — core feature; no fallback. Available on testnet + mainnet. |
| `sui::zklogin_verified_issuer` | `ZkLoginVerifiedIssuer` object for Google sub claim | None — Sybil resistance is core. Available on testnet + mainnet. |
| `sui::clock` (0x6) | `clock::timestamp_ms(&clock)` for phase gating | Always available. |
| `@mysten/dapp-kit` | `useSuiClient`, `useSignAndExecuteTransaction`, zkLogin hooks | — |
| Google OAuth | JWT issuance for zkLogin proof | — |
| **Walrus** (blob storage) | `walrus_client.store(encrypted_blob)` → `blob_id`; `walrus_client.read(blob_id)` | Falls back to localStorage-only; nonce not cross-device recoverable |
| **Seal** (threshold encryption) | `seal.encrypt(nonce, policy)` where policy = Move module `fairdrop::seal_policy`; `seal.decrypt(ciphertext, entry_obj_id)` | Falls back to localStorage-only nonce |
| **Enoki** (sponsored transactions) | `EnokiFlow.sponsorTransaction(tx_bytes)` for `register` and `commit_bid` | Falls back to self-sponsored tx from bidder's wallet |
| **Pyth Network** | `@pythnetwork/pyth-sui-js` — fetch `SUI/USD` price feed on testnet for bid amount conversion display | Display amount in SUI only (no USD conversion) |

---

## 8. Edge Cases & Adversarial Scenarios

**Scenario**: Bidder commits but never reveals.
**Risk level**: 🟡 Medium
**Handling**: No-show bidder's `Commitment` object is not consumed by resolution. After `reveal_end_epoch`, bidder can call `reclaim_unrevealed` to recover escrowed SUI. No-show does not affect winner selection — only revealed bids participate.

**Scenario**: Attacker submits commitment with minimal escrow, then reveals a massive bid amount.
**Risk level**: 🔴 High
**Handling**: `reveal_bid` enforces `escrow.value >= amount`. If `amount > escrow.value`, transaction aborts `EInsufficientEscrow`. Attacker cannot fake a high bid.

**Scenario**: 1,000 Google accounts created by one actor.
**Risk level**: 🟡 Medium
**Handling**: Structurally bounded — phone-verified Google accounts cost real effort and risk account bans. Not zero-cost Sybil. Acceptable for MVP. Post-MVP: integrate Worldcoin or Civic for stronger identity.

**Scenario**: Late revealer observes early reveals and sets bid just above clearing price.
**Risk level**: 🟡 Medium
**Handling**: Intentional — reveals are public by design during reveal phase. Commit phase prevents the far worse attack (seeing bids before committing). This mirrors standard Vickrey auction information release.

**Scenario**: Resolution gas exhaustion with 500+ participants.
**Risk level**: 🔴 High
**Handling**: Resolution iterates all reveals once (sort + 500 transfers). Estimated ~0.2 SUI for 500 participants — well within Sui's 50 SUI PTB gas limit. For hackathon scale (< 200 participants), no issue. Production mitigation: off-chain sort with on-chain Merkle proof verification.

**Scenario**: `resolve` called twice.
**Risk level**: 🔴 High
**Handling**: `resolved: bool` flag in `Auction`. First call sets `resolved = true` before any transfers. Second call aborts with `EAlreadyResolved`.

**Scenario**: Bidder clears localStorage before reveal — nonce lost locally.
**Risk level**: 🟢 Low (mitigated by F-9)
**Handling**: Frontend automatically recovers nonce via Walrus + Seal: fetches `Commitment.blob_id`, calls Seal SDK to decrypt using bidder's Entry object ownership, restores nonce to localStorage. Works cross-device. If Walrus/Seal unavailable (network down), bid is a no-show and bidder calls `reclaim_unrevealed` after `reveal_end_epoch`. UI still warns users to keep localStorage intact as primary path.

**Scenario**: Two bidders tie exactly at clearing price margin.
**Risk level**: 🟡 Medium
**Handling**: Clearing price = lowest price at which supply is fully subscribed. All bidders strictly above clearing price are unambiguous winners. Bidders exactly at clearing price are randomized: `RandomGenerator` shuffles them and selects the needed number. Most resolution invocations touch zero or one marginal bidder.

**Scenario**: Sui testnet epoch advances during live demo — phase changes unexpectedly.
**Risk level**: 🟢 Low
**Handling**: Pre-configure demo auction with commit/reveal epochs well clear of actual demo time. Use testnet with known epoch cadence. Have pre-staged accounts at each phase ready as fallback.

---

## 9. Security Considerations

**Reentrancy**: Move on Sui has no Solidity-style reentrancy (no arbitrary `call` with gas). Multi-transfer resolution executes atomically in one PTB. No reentrancy risk.

**Object confusion**: Every entry function checks `entry.auction_id == auction.id` and `commitment.auction_id == auction.id`. Mismatch aborts with `EWrongAuction`. Cannot reuse objects across auctions.

**Nullifier collision**: `sha3_256(google_sub || auction_id)` — SHA3-256 preimage resistance means attacker cannot craft second identity with same nullifier. Google `sub` claims are globally unique and non-reusable.

**Randomness manipulation**: Sui `sui::random` uses DKG with Shamir secret sharing across validators. Single validator cannot bias. Requires 67%+ collusion — identical threshold to consensus safety. No flash-loan manipulation window: randomness request and usage are in the same transaction.

**Commitment front-running during reveal phase**: Early revealers expose amounts. Later revealers gain marginal information advantage. This is acknowledged and acceptable — it's the designed information schedule, not a vulnerability.

**zkLogin proof replay**: ZK proofs are epoch-bound. Proof valid in epoch N is invalid in epoch N+1 (ephemeral key expires). Enforced by Sui validators at the ZK verifier layer — no custom code needed.

**Clearing price inflation attack**: A well-funded attacker reveals a very high bid to move clearing price. Structural to sealed-bid auctions with public reveal. Acceptable for launch mechanics; all reveals are public post-commit-phase.

**OtterSec audit checklist**:
- `Table` / `VecMap` access bounds verified — no index panics
- `Coin::split` / `Coin::join` arithmetic — no `u64` overflow at bid amounts
- Phase enforcement consistent across all entry functions — no state machine escape
- `resolved = true` set before first coin transfer in `resolve`
- No `public fun` that should be `public entry fun`
- `CreatorCap` / `Entry` / `Commitment` ownership enforced by Sui runtime, not custom logic

---

## 10. Dependencies & Risks

| Dependency | Risk if unavailable | Mitigation |
|---|---|---|
| `sui::random` (0x8) on testnet | Cannot demonstrate fair winner selection | Available on testnet and mainnet. Verify object 0x8 exists on target network pre-demo. |
| zkLogin on testnet | Registration flow broken | Live on testnet + mainnet. Verify before demo day. |
| Google OAuth client credentials | Frontend auth broken | Create GCP project with OAuth 2.0 client ID. Low risk — standard setup. |
| Sui testnet stability on demo day | Live demo interrupted | Pre-fund demo accounts; pre-deploy contracts; have screen-recorded backup flow. |
| Browser WASM ZK prover | Proof generation fails on judge's machine | Test Chrome + Firefox. Safari WASM may be limited. Recommend Chrome for judges. |
| `@mysten/sui.js` API stability | Frontend breaks | Pin exact package versions. No `npm update` within 48h of demo. |
| Testnet SUI for demo accounts | Transactions fail live | Pre-fund 3 demo accounts with 10 SUI each. Have faucet URL ready. |
| localStorage nonce persistence | Bidder can't reveal locally | F-9 Walrus+Seal backup is primary mitigation; localStorage is fallback. |
| Walrus testnet availability | F-9 nonce backup fails | Graceful degradation: falls back to localStorage-only. Core auction unaffected. |
| Seal SDK + policy deployment | Nonce encryption/decryption fails | Same graceful degradation. `seal_policy` module must be deployed before frontend build. |
| Enoki API key + testnet credits | Gasless txs fail | Graceful degradation: self-sponsored txs used. Core feature unaffected. Obtain key from Mysten Labs developer portal pre-demo. |
| Pyth SUI/USD price feed on testnet | USD amounts not displayed | Display SUI amount only. Non-critical. |

---

## 11. Build Plan

### 11.1 Milestones

| Day | Date | Milestone | Deliverable |
|---|---|---|---|
| 1 | May 27 | Scaffold | Move package init, Next.js init, testnet deploy working ✅ |
| 2 | May 28 | Core auction contract | `create_auction`, structs, `CreatorCap`, `commit_bid`, `reveal_bid`, passing unit tests |
| 3 | May 29 | Resolution + randomness | `resolve` with `sui::random`, clearing price, winner certs, refunds |
| 4 | May 30 | zkLogin + claim + withdraw | `register` with nullifier dedup; `claim`, `withdraw_proceeds`, `reclaim_unrevealed`; full happy path tests |
| 5 | May 31 | Seal policy contract | `fairdrop::seal_policy` Move module — access policy: Entry ownership + commit phase check; deploy to testnet |
| 6 | June 1 | Frontend: auth + state | zkLogin flow (Enoki-wrapped), RPC object reads, phase display, Pyth SUI/USD feed |
| 7 | June 2 | Frontend: commit + Walrus/Seal | Commitment form, nonce gen, Seal encrypt, Walrus upload, blob_id stored on-chain |
| 8 | June 3 | Frontend: reveal + nonce recovery | Reveal form (localStorage first; Walrus+Seal fallback), resolution trigger |
| 9 | June 4 | Frontend: claim + results | Winner cert display, claim button, refund status |
| 10 | June 5 | Integration testing | Full end-to-end: 3 simulated bidders on testnet; verify Walrus blob upload + Seal decrypt round-trip |
| 11 | June 6 | Edge case hardening | No-show, tie-breaking, insufficient escrow, double-resolve, cross-device nonce recovery tests |
| 12 | June 7 | UI polish + demo setup | Tailwind styling, demo accounts pre-staged, Enoki gasless verified |
| 13 | June 8 | Buffer / bug fixes | Regression testing, gas estimation, Pyth feed validation |
| 14 | June 9 | Demo rehearsal | Full 3-minute demo run, timing locked |
| 15 | June 10 | Submission prep | README, testnet contract addresses, video if required |
| 16 | June 11 | Final submission | Submit by deadline |
| 17–18 | June 13–14 | Demo Day | Live demo + judge Q&A |

### 11.2 Team Responsibilities

**Solo (1 dev)**: Move contracts first (Days 1–6) before any frontend work. Never start frontend without passing contract tests — broken contract invalidates all frontend work.

**Two devs**: Dev 1 (Move): Days 1–6 contracts + Days 11–12 hardening. Dev 2 (Frontend): Days 7–10 (start with mock contract addresses, swap to real ones Day 6). Both: Days 13–19 polish + demo.

---

## 12. Demo Day Script (3 minutes)

**0:00–0:30 — Hook**
- Say: "Every major token launch this year was stolen — not by hackers, but by bots, MEV bots, and insiders who saw your bid before you submitted it. FairDrop makes that mathematically impossible. Let me show you."
- Show: Split screen — left: screenshot of a bot-swept NFT mint. Right: FairDrop UI, "Phase: COMMIT | 3 bidders registered."

**0:30–1:30 — Core Demo**
- Do: Click "Sign in with Google." Complete OAuth. Show: "Entry minted on-chain — gas sponsored by Enoki." Open Sui Explorer: show `Entry` object owned by demo address.
- Do: Type "50 SUI" bid ($X USD via Pyth). Click "Commit." Show transaction confirmed (gasless). Open Explorer: `Commitment` object — show no amount field, only hash + blob_id.
- Say: "That blob_id is a pointer to Walrus — the nonce is encrypted there using Kostas Chalkias's Seal threshold encryption. Even if a bidder clears their browser, they can recover their nonce on any device."
- Do: (Pre-staged reveal-phase account.) Click "Reveal Bid." Transaction confirmed. `BidRevealed` event fires showing amount 50.
- Do: Click "Resolve Auction." Transaction confirmed. `AuctionResolved` event — clearing price 40, 2 winners. Show `WinnerCertificate` object.
- Key moment: Open `resolve` transaction in Explorer. Point to the `Random` input object (0x8). Say: "This is Andrew Schran's DKG randomness — backed by the entire Sui validator set. No single party could have predicted or manipulated this output."
- Avoid: No network switches mid-demo. No live ZK proof generation (pre-stage registered account). No raw Move error messages on screen.

**1:30–2:30 — Technical Credibility**
- Show: Architecture diagram (3 boxes: Google OAuth → zkLogin ZK proof → Sui contract → 0x8 randomness). No backend box.
- Show: `fairdrop::auction` on Sui Explorer. Point to `registered_nullifiers: Table` and `reveals: VecMap`.
- Say: "The hardest part was composing three independent Sui primitives — zkLogin, commit-reveal, and native randomness — into a single atomic settlement transaction. Each was buildable in isolation. Making them interlock without introducing new trust assumptions was the engineering problem."

**2:30–3:00 — Close**
- Say: "FairDrop is launch infrastructure. Any project on Sui deploys one `Auction` object and points their community at it — no backend, no bot problem, no rigged randomness. We've integrated four sponsor technologies: Walrus for nonce storage, Seal for threshold encryption, Enoki for gasless UX, and Pyth for real-time USD pricing."
- Ask: "We're in DeFi & Payments and Walrus tracks. We'd specifically welcome feedback from Andrew and Deepak on our use of the randomness and zkLogin APIs — and from Kostas on whether our Seal access policy is correct."

---

## 13. Success Metrics

| Metric | Hackathon target | Post-launch target |
|---|---|---|
| Full happy path on testnet | Yes — end-to-end without CLI | 99.9% transaction success rate |
| ZK proof generation time | < 3s on demo machine | < 2s (optimized WASM) |
| No-bot guarantee demonstrable | Show nullifier dedup live in demo | 0 double-registrations in production launches |
| Randomness tamper-evidence | 0x8 Random visible in Explorer | All resolutions link to DKG proof on-chain |
| Resolution atomicity | All refunds + winner certs in one tx | Same |
| Demo fits in 3 minutes | Rehearsed 3+ times, < 3:00 | — |
| Contract deployed + verified | Testnet object IDs in README | Mainnet deployment with verified source |
| Move code quality | < 500 LOC with full test coverage | — |
| Judge technical questions | All 3 primitives fully understood by team | — |

---

## 14. Open Questions

**Q1: zkLogin nullifier scope** — Should the nullifier be `sha3_256(google_sub || auction_id)` (auction-specific, allows same person to participate in multiple auctions) or `sha3_256(google_sub)` (global, one Google account can only ever register in one FairDrop auction)? Auction-specific is more user-friendly. Decision needed before writing `register`.

**Q2: Phase enforcement granularity** — Epoch-based (`clock::epoch`) gives ~24h granularity on mainnet. Timestamp-based (`clock::timestamp_ms`) gives millisecond precision. For demos on testnet with fast-advancing epochs, timestamp is safer for timed demonstrations. Recommendation: timestamp-based with configurable windows. Lock before writing clock logic.

**Q3: No-show escrow policy** — Should no-show bidders (committed, didn't reveal) have their escrow: (a) forfeited to creator/protocol as penalty — discourages griefing, bad UX for honest users who lose localStorage; or (b) reclaimable via `reclaim_unrevealed` after `reveal_end_epoch` — cleaner UX. Recommendation: option (b) with no penalty. Lock before writing `resolve`.

**Q4: WinnerCertificate as Sui Display NFT** — Worth adding `display::new` setup (~20 extra lines) so certificates show up with metadata in Sui wallets/explorers. Demo-quality improvement but risks instability close to deadline. Decision: yes if implementation complete by Day 5, skip otherwise.

**Q5: Clearing price definition at margin** — Confirm: clearing price = lowest bid such that cumulative supply of equal-or-higher bids >= total supply. Bidders strictly above clearing price = unambiguous winners. Bidders exactly at clearing price = randomized subset. This must be precisely coded in `resolve` before Day 5. No ambiguity permitted in the resolution algorithm.
