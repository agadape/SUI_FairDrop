# FairDrop

**Fair token launches on Sui — cryptographically enforced, no trust required.**

FairDrop is a sealed-bid auction protocol for fair token distribution. Every fairness guarantee is enforced on-chain by Sui-native primitives. No backend. No admin keys. No favored insiders.

Live on testnet: [suiscan.xyz/testnet/object/0xf078e2...](https://suiscan.xyz/testnet/object/0xf078e2c6ae561ddf4b079c6c15cfa6158489404f5d32c66edbebc5944b5e4006)

---

## The problem

Standard token launches are broken by design:

- **Bots** front-run public mints before humans can react
- **Whales** see bid amounts and shade their bids accordingly  
- **Insiders** receive allocations before the public launch opens

FairDrop makes these attacks cryptographically impossible.

---

## How it works

Three primitives composed into a sealed-bid uniform-price auction:

### 1. zkLogin — one human, one entry

Registration takes a zkLogin proof (Google OAuth). The proof produces a **nullifier** — `sha3_256(address || auction_id)` — stored on-chain. One Google account maps to exactly one nullifier. Second registration from any address or nullifier → rejected.

### 2. Commit-reveal — bids are blind

During the commit phase, bidders submit `sha3_256(amount_le || nonce)`. The amount is hidden. No one — not other bidders, not the creator — can see bid values until the reveal phase opens.

### 3. `sui::random` — provably fair winner selection

Resolution uses Sui's on-chain randomness (`0x8`), which is produced by a distributed key generation (DKG) network of validators. When multiple bidders tie at the clearing price, the tie is broken by `sui::random::RandomGenerator`. No one can predict or influence the outcome.

### Clearing price logic

1. Collect all revealed bids
2. Sort descending
3. Clearing price = lowest bid where cumulative supply ≥ total supply
4. Bidders strictly above clearing: automatic winners
5. Bidders exactly at clearing: randomized via `sui::random`
6. Winners receive `WinnerCertificate`; losers receive full escrow refund

All refunds and certificate mints happen atomically in one PTB.

---

## Sponsor integrations

| Sponsor | Integration |
|---------|-------------|
| **Walrus** | Encrypted nonce blobs — `blob_id` stored in `Commitment` on-chain; used to recover bid nonce if localStorage is cleared |
| **Seal** | Threshold encryption of nonce — access policy `fairdrop::seal_policy` requires `Entry` ownership; decryption requires the bidder's object, not just their address |
| **Enoki** | Sponsored transactions — `register` and `commit_bid` are gasless for bidders via Enoki sponsored-tx flow with direct-sign fallback |
| **Pyth** | SUI/USD price feed — real-time bid value displayed in USD alongside SUI amount |

---

## Deployed contracts (testnet)

| Object | Address |
|--------|---------|
| Package | [`0xd0560a86bca4ee7af9f17d5b91b9f876f9f4b6b1dfee665367d2d88e0bf77dee`](https://suiscan.xyz/testnet/object/0xd0560a86bca4ee7af9f17d5b91b9f876f9f4b6b1dfee665367d2d88e0bf77dee) |
| Auction | [`0xf078e2c6ae561ddf4b079c6c15cfa6158489404f5d32c66edbebc5944b5e4006`](https://suiscan.xyz/testnet/object/0xf078e2c6ae561ddf4b079c6c15cfa6158489404f5d32c66edbebc5944b5e4006) |
| Random (shared) | `0x8` |
| Clock (shared) | `0x6` |

---

## Repo structure

```
contracts/
  sources/
    auction.move        # core protocol — commit-reveal, resolution, escrow
    seal_policy.move    # Seal access policy — entry-ownership gated decryption
  tests/
    auction_tests.move  # 23 tests including replay-attack coverage
  Move.toml
  Published.toml        # deployed package metadata

frontend/
  app/
    page.tsx            # multi-section landing page
    components/
      LiveAuction.tsx   # phase-aware auction UI (commit / reveal / resolve / claim)
    layout.tsx
    providers.tsx
  lib/
    constants.ts        # contract addresses and network config
    hash.ts             # sha3_256 commitment hash
    enoki.ts            # sponsored tx with direct-sign fallback
    seal.ts             # Seal threshold encryption client
    walrus.ts           # Walrus blob storage client
    pyth.ts             # Pyth SUI/USD price feed

scripts/
  deploy.sh             # publish + auction setup (bash)
  deploy.ps1            # publish + auction setup (PowerShell)
```

---

## Running locally

### Contracts

```bash
# build
sui move build --path contracts/

# test (all 23)
sui move test --path contracts/

# deploy to testnet
sui client switch --env testnet
sui client publish --path contracts/ --gas-budget 200000000
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_PACKAGE_ID, NEXT_PUBLIC_AUCTION_ID, NEXT_PUBLIC_ENOKI_API_KEY, NEXT_PUBLIC_GOOGLE_CLIENT_ID

npm install
npm run dev          # localhost:3000
npm run build        # static export
```

---

## Security properties

| Attack | Defense |
|--------|---------|
| Sybil (multiple entries per person) | zkLogin nullifier + per-address dedup — both checked on `register` |
| Front-running | Commit phase hides amounts; only hash on-chain until reveal |
| Bid shading | Uniform clearing price — overbidding wastes nothing beyond clearing price |
| Winner impersonation | `Entry` has no `store` — cannot be transferred; `commit_bid` checks `entry.owner == sender` |
| Cross-auction object reuse | Every entry function asserts `object.auction_id == auction.id` |
| Double-resolve | `resolved = true` set before first coin transfer |
| Winner reclaiming escrow | `reclaim_escrow` checks winners table and rejects |

---

## Tech stack

- **Smart contracts**: Move 2024 (Sui)
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Framer Motion
- **Wallet**: `@mysten/dapp-kit`, zkLogin via Enoki
- **Static export**: no server, no backend — `output: 'export'`
