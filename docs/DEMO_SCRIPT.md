# FairDrop → Umbra — the 3-minute stage pitch

Judges: **Kostas Chalkias** (Seal), **Deepak Maram** (zkLogin), **Andrew Schran** (sui::random).
Goal: open on emotion, pivot to DeFi's biggest problem, prove one primitive twice.

---

## PRE-FLIGHT (do BEFORE you walk on — none of this happens live)

- [ ] Demo wallet funded ≥ 1 SUI. Network = **testnet**. `/fast` off, notifications muted.
- [ ] **FairDrop**: a COMMIT-phase auction loaded (env `AUCTION_ID`), with a bid already
      committed + Walrus-backed, so **Recover** works instantly. Sit on the committed-bid card.
- [ ] **Umbra pool A (live hero)**: a short pool staged ~3 min before you go on
      (`stage_pool.ps1 -CommitWindowMinutes 4 -RevealWindowMinutes 8`), **floor planted**
      (`submit_floor.ps1 -PoolId <A> -PriceSui 0.001`). Point `.env`/Vercel at it.
- [ ] **Umbra pool B (payoff fallback)**: a pool you already drove to SETTLED with a
      claimed **MEV-Shield NFT** in the wallet — so the NFT card is one click (or already
      on screen) even if live timing slips. This is your safety net for the climax.
- [ ] Two browser tabs open: `/` (FairDrop) and `/umbra`. Rehearse the tab switch.

---

## THE SCRIPT (180s)

### 0:00–0:10 — Cold open (no slides; FairDrop already on screen)
> "Raise your hand if you've ever lost a crypto wallet. … Keep it up if you got
> everything back. … Right. Here's a fair-launch auction you can't get locked out of."

### 0:10–0:40 — The recovery beat  → **Maram + Chalkias + Walrus**
*(on the committed-bid card)*
> "I'm in with a Google login — no seed phrase. That's **zkLogin**.
> I placed a sealed bid; the chain only ever saw a hash.
> Now watch —"
*(click **Simulate device loss**)*
> "I just wiped the only key on this device."
*(click **Recover from Walrus + Seal** — rail runs Walrus → Seal → Restored)*
> "My bid was encrypted with **Seal**, stored on **Walrus**, and the chain just
> authorized me — the Entry owner — to pull it back. No server. No team. Nobody
> could read it but me. **Lose your device, keep your bid.**"

### 0:40–1:00 — The pivot  → **the seam**
*(the policy seam unfolds under the recovery)*
> "That recovery wasn't special-cased. It's **one on-chain policy** over a
> recoverable, custodian-blind secret. Change the policy — and the same primitive
> solves something much bigger. Every public swap leaks your order to the mempool.
> Bots front-run it, sandwich it — **billions** stolen a year. So we pointed the
> same engine at it."
*(switch tab → `/umbra`)*

### 1:00–1:10 — Enter Umbra
> "Same five-thousand-dollar swap. Two outcomes."

### 1:10–1:40 — The Rekt (left panel)
> "Left, a normal Cetus swap. The victim broadcasts — visible in the mempool. A bot
> front-runs, pushes the price, the victim fills worse, the bot banks the spread."
*(point at **−$42.17**)*
> "Forty-two dollars, gone. The bot only had to **see** the trade."

### 1:40–2:10 — The Shield (right panel) — **LIVE**  → **Chalkias + Walrus + Schran**
*(enter the order, click **Submit Confidential Order**)*
> "Right, Umbra. Same swap. It **Seal**-encrypts my order, backs it up to **Walrus**,
> and submits —"
*(the 32-byte hash appears)*
> "— and **this** is everything the mempool sees. A 32-byte shadow. Nothing to
> front-run. Nothing to reorder. **Zero extractable.** When the batch closes it
> clears at one fair price, and ties break with **sui::random** — validator DKG, no
> one can bias who fills."

### 2:10–2:45 — Settle → the payoff NFT  → **the climax**
*(settle + claim on the floored pool, or reveal pool B's pre-claimed card)*
> "It settled, I claim my fill — and I get **this**."
*(MEV-Shield NFT card on screen)*
> "A dynamic NFT that records exactly how much MEV it shielded — and **evolves**
> every trade. Sealed by Seal, stored on Walrus, cleared by sui::random.
> It's a receipt for the theft **that didn't happen**."

### 2:45–3:00 — The close  → **the category line**
> "FairDrop and Umbra are the **same primitive** — a recoverable, on-chain-governed
> secret no server can read — wearing two different policies. One is a fair launch
> you can't get locked out of. The other kills MEV. We didn't build two apps.
> We built one primitive, and we proved it **twice**. Thank you."

---

## Primitive coverage (every judge feels their work)
- **Seal** (Chalkias): recovery decrypt + order encryption — the trust spine of both apps.
- **Walrus** (headline): blob storage for both the bid nonce and the order nonce.
- **zkLogin** (Maram): walletless Google entry, honest framing (raises Sybil cost).
- **sui::random** (Schran): fair tie-break in both resolve and settle — point at 0x8.

## If something breaks (contingency)
- Recovery hangs → "the key servers are doing a threshold handshake" → refresh, it's idempotent.
- Live submit slow → keep talking over the hash; it's one tx.
- Settle/claim timing slips → cut to **pool B** (already-claimed NFT). Never wait on stage.
- Always have the SuiScan object/tx tabs ready — "don't trust me, here it is on-chain."
