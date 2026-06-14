# Umbra — Confidential, MEV-Proof Settlement on Sui (1-page spec)

## Thesis
Every public swap leaks order flow to the mempool → bots sandwich it. Umbra makes
the order **unobservable until it's too late to attack**, then settles a batch at a
single fair price in a **randomized** order. Nothing to front-run (no one saw it),
nothing to reorder (the attacker doesn't control sequencing). Lose your device
mid-order → recover it from Walrus + Seal. Onboard with Google (zkLogin).

**It is the FairDrop commit-reveal engine, re-aimed from "fair launch allocation"
to "confidential fair swap."** Same primitives, bigger market.

## What we recycle (≈90%)
| Piece | FairDrop auction | Umbra swap |
|---|---|---|
| Blind commit | `sha3_256(amount‖nonce)` | `sha3_256(price‖qty‖nonce)` |
| Reveal + verify | `reveal_bid` | `reveal_order` |
| Clearing + fair tie-break | `resolve` + `sui::random` | `settle` + `sui::random` |
| Nonce backup / recovery | Seal enc → Walrus blob → `seal_approve` | identical, gated by `SealedOrder` |
| Walletless entry | zkLogin / Enoki | identical |

## Roles & flow
```
Maker:  create_pool(inventory: Coin<UMB>, supply_units, min_price, commit_end, reveal_end)
Taker:  submit_order(hash, escrow: Coin<SUI>, blob_id?)        # COMMIT phase, blind
Taker:  reveal_order(price, qty, nonce)                         # REVEAL phase, verified
Anyone: settle(Random, Clock)                                  # after reveal_end
Taker:  claim_fill(order, MevShieldNFT?)                        # winners get UMB + refund + NFT; losers full refund
Maker:  withdraw_proceeds(MakerCap)                            # SUI proceeds + unsold UMB
```

## Settlement (uniform price + random margin)
1. Collect revealed `(price, qty)`; sort **desc by price**.
2. If `total_qty ≤ supply`: everyone fills; `clearing = lowest revealed price`.
3. Else: `clearing` = price of the order at which cumulative qty first ≥ supply.
4. All orders **strictly above** clearing fill fully (winners).
5. Orders **at** clearing compete for the remaining supply — **shuffled by
   `sui::random` (Fisher-Yates)**, whole-order fills until remaining is exhausted.
6. Uniform price: every winner pays `clearing × qty` (≤ their bid → **price
   improvement**). MVP keeps whole-order fills (no partials) — note in demo.

## "MEV Saved" dynamic NFT (`MevShieldNFT`)
- On a winning `claim_fill`, compute the **on-chain, honest** saving:
  `saved = (your_price − clearing_price) × qty` — real uniform-price improvement
  you'd have lost to a pay-your-bid / sandwiched execution.
- Mint on first fill; **update** (`trades++`, `total_saved += saved`) on later fills
  → the NFT *evolves*. Rendered via `sui::display` (`name`, `description`,
  `image_url` template referencing `{total_saved}` / `{trades}`).
- Frontend juxtaposes the historical Cetus/Turbos sandwich loss for the *narrative*
  number; the NFT stores the *provable* on-chain figure. (Honest framing — these
  judges built the primitives.)

## Demo (scope-locked)
- **Left "rekt" panel:** hardcoded JSON of a real Cetus/Turbos sandwich → shows a
  ~$40 victim loss. *Static. We fake the attacker.*
- **Right "Umbra" panel:** a **live** `submit_order` → show the 32-byte commitment
  hash on-chain (unobservable), settle, `claim_fill`, mint the MEV-Saved NFT.
  *We prove the defense live.*

## On-chain objects
- `SwapPool` (shared) — inventory `Balance<UMB>`, commitments, reveals, winners,
  clearing_price, proceeds `Balance<SUI>`, phase timestamps, settled.
- `SealedOrder` (owned) — `commitment_hash`, `escrow: Balance<SUI>`, `blob_id?`.
- `MakerCap` (owned) — authorizes proceeds withdrawal.
- `MevShieldNFT` (owned, dynamic) — cumulative MEV-saved receipt.
- `umbra_policy::seal_approve(id, &SealedOrder, &SwapPool, &Clock)` — Seal gate:
  caller's order is for this pool AND `now < reveal_end`.

## Out of scope (MVP)
Generic asset types (fixed `UMB` demo coin), partial fills, live attacker sim,
multi-batch / continuous markets, real liquidity. Frontend trading UI + side-by-side
demo + NFT render are separate workstreams.
