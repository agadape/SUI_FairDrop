# FairDrop 🎯

> *What if a token launch actually couldn't be gamed?*

FairDrop is a sealed-bid auction for fair token distribution on Sui. Every fairness guarantee is enforced on-chain by cryptographic primitives — not promises, not terms of service, not a multisig you have to trust.

No backend. No admin keys. No favored insiders.

**[→ Try it live on testnet](https://suiscan.xyz/testnet/object/0xf078e2c6ae561ddf4b079c6c15cfa6158489404f5d32c66edbebc5944b5e4006)**

---

## The problem with every other token launch

Picture a typical NFT mint or token sale:

1. Team announces launch time
2. Bots flood the RPC 0.001s before open
3. Whales watch the mempool and adjust their bids last-second
4. Insiders got their allocation in a Telegram group last week

The "fair launch" was never fair. The game was rigged before it started.

**FairDrop makes these attacks cryptographically impossible.** Not "we promise we won't." Impossible.

---

## How it works

Three Sui-native primitives, composed into one airtight protocol:

### 🪪 zkLogin → One human, one entry

You sign in with Google. Under the hood, a zero-knowledge proof turns your Google identity into a **nullifier** — a unique fingerprint that's stored on-chain without revealing your identity.

Try to register twice? The contract rejects it. No second accounts, no burner wallets, no Sybil attacks.

### 🔒 Commit-reveal → Bids are completely blind

During the commit phase, you submit a hash of your bid: `sha3_256(amount || nonce)`. The amount is invisible. No one — not other bidders, not the creator, not a node operator — can see what you bid until the reveal phase opens.

Bid-shading and front-running require seeing the bids. You can't front-run what you can't see.

### 🎲 `sui::random` → The winner draw nobody can rig

When bidders tie at the clearing price, winners are chosen using Sui's on-chain randomness (`0x8`) — produced by a distributed key generation network across all Sui validators. No single party can predict or influence the output.

This isn't "we used Chainlink VRF." The randomness is native to the chain itself, built by the same team that designed Sui's cryptography.

---

## The auction flow

```
Register (zkLogin)
    ↓
Commit phase — submit hash(amount || nonce)
    ↓
Reveal phase — reveal amount + nonce (contract verifies hash matches)
    ↓
Resolution — sort bids, find clearing price, sui::random breaks ties
    ↓
Winners get WinnerCertificate → claim tokens
Losers get full escrow refund, atomically
```

**Clearing price logic:** sort all revealed bids highest-to-lowest. Find the lowest bid where the cumulative supply of equal-or-higher bids meets the total supply. That's the clearing price. Winners above it pay the clearing price, not their bid. Overbidding costs you nothing extra.

---

## Sponsor integrations

| | What | Why it matters |
|---|---|---|
| **Walrus** 🦭 | Stores your encrypted nonce as a blob on decentralized storage. The `blob_id` lives in your `Commitment` object on-chain. | Close the tab mid-auction? Your nonce isn't gone. |
| **Seal** 🔐 | Threshold-encrypts the nonce. The decryption access policy (`fairdrop::seal_policy`) requires ownership of your `Entry` object. | Only *you* can decrypt your nonce — your key server can't hand it to anyone else. |
| **Enoki** ⛽ | Sponsored transactions for `register` and `commit_bid`. | Zero gas to register and place a bid. Enoki pays. |
| **Pyth** 📈 | Live SUI/USD price feed in the bid UI. | You always know what your bid is worth in dollars. |

---

## Deployed contracts

| Object | Address |
|--------|---------|
| Package | [`0xd0560a...`](https://suiscan.xyz/testnet/object/0xd0560a86bca4ee7af9f17d5b91b9f876f9f4b6b1dfee665367d2d88e0bf77dee) |
| Auction | [`0xf078e2...`](https://suiscan.xyz/testnet/object/0xf078e2c6ae561ddf4b079c6c15cfa6158489404f5d32c66edbebc5944b5e4006) |
| Randomness | `0x8` (Sui shared object) |
| Clock | `0x6` (Sui shared object) |

Everything is publicly inspectable on SuiScan right now.

---

## Repo structure

```
contracts/
  sources/
    auction.move        # core protocol: commit-reveal, resolution, escrow
    seal_policy.move    # Seal access policy: entry-ownership gated decryption
  tests/
    auction_tests.move  # 23 tests, including 6 exploit-replay scenarios

frontend/
  app/
    page.tsx            # landing page (9 sections, Framer Motion animations)
    components/
      LiveAuction.tsx   # the actual auction UI: commit / reveal / resolve / claim
  lib/
    constants.ts        # contract addresses, network config
    hash.ts             # sha3_256 commitment hash
    enoki.ts            # sponsored tx + direct-sign fallback
    seal.ts             # Seal threshold encryption client
    walrus.ts           # Walrus blob storage client
    pyth.ts             # Pyth SUI/USD price feed

scripts/
  deploy.sh / deploy.ps1   # publish contracts + initialize auction
```

---

## Run it yourself

### Contracts

```bash
# build
sui move build --path contracts/

# run all 23 tests
sui move test --path contracts/

# deploy to testnet
sui client switch --env testnet
sui client publish --path contracts/ --gas-budget 200000000
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
# fill in: PACKAGE_ID, AUCTION_ID, ENOKI_API_KEY, GOOGLE_CLIENT_ID

npm install
npm run dev        # localhost:3000
npm run build      # static export, no server needed
```

---

## Security breakdown

| Attack vector | How FairDrop blocks it |
|---------------|------------------------|
| Sybil (multiple entries per person) | zkLogin nullifier + per-address dedup — both checked at `register` |
| Front-running | Commit phase hides amounts behind a hash until reveal |
| Bid shading | Blind bids — you can't shade what you can't see |
| Winner impersonation | `Entry` has no `store` — non-transferable; `commit_bid` checks `entry.owner == sender` |
| Cross-auction object reuse | Every entry function asserts `object.auction_id == auction.id` |
| Double-resolve | `resolved = true` set before first coin transfer |
| Winner reclaiming escrow | `reclaim_escrow` checks winners table and rejects |

---

## Stack

**Contracts** — Move 2024 (Sui), deployed to testnet

**Frontend** — Next.js 14, TypeScript, Tailwind CSS, Framer Motion, static export (`output: 'export'` — zero backend)

**Wallet** — `@mysten/dapp-kit`, zkLogin via Enoki

---

*Built for Sui Overflow 2026*
