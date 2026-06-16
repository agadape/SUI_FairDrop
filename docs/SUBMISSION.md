# FairDrop + Umbra — Winning Submission Package

> **Core message (every section reinforces it):**
> **Seal made secrets programmable. We made them recoverable — and proved it across two policies.**

**Reality sync vs the official Overflow 2026 handbook (authoritative):**
- Demo Day = **5 min present + 2 min Q&A** (the 3-min script below is the dense core; the +2 min are the real-world open + roadmap close — see §3).
- There is **no standalone "Privacy" track.** Tracks: Agentic Web · DeFi & Payments · Walrus · DeepBook. "Programmable privacy" is the *narrative*; the **submitted track is Walrus** (recovery *is* Walrus as the verifiable, recoverable data layer), with **DeFi & Payments** as the fallback. Track copy for both in §7.
- Deadline **June 21, 6PM PT**. Judging: **Real-World Application 50% · Product/UX 20% · Technical 20% · Presentation/Vision 10%.**

---

## 1 · Positioning

**One-liner (14 words):**
A recoverable, on-chain-policy-gated secret no server can read — proven across two live policies.

**Tagline (7 words):**
Seal made secrets programmable. We made them recoverable.

---

## 2 · Opening hook — 0:00–0:30

| | |
|---|---|
| **SAY** | "Encrypt a secret on-chain today and you accept one rule: lose the device that holds the key, and the secret is gone forever. We removed that rule." |
| **SHOW** | A single committed secret on screen — a 32-byte hash. One clean line: `commitment 0x7c1b…` · `escrow locked` · `nobody can read it`. |
| **SAY** | "Watch me lose the only device that can open it." |
| **SHOW** | Click **Simulate device loss**. The local key wipes. The card flips to `??? — this device can no longer open it`. Beat of silence. |
| **SAY** | "No server has it. No team has it. So how does it come back? An on-chain policy says it can." |
| **SHOW** | Click **Recover**. Rail runs **Walrus → Seal → Restored**. Secret returns. Caption: *no server ever saw it.* |

Structure delivered: **Problem → Recovery failure → Primitive reveal.** The auction word is never spoken in the first 30 seconds.

---

## 3 · Demo script (core ≈3:00; bookends to 5:00 for Demo Day)

> **Mute test:** every beat below is legible with the sound off. If a scene doesn't push one of {secret committed · device lost · recovery succeeds · nobody helped · policy allowed it · same primitive, many apps}, it's cut.

**[0:00–0:30] Opening hook** — as §2.

**[0:30–1:00] A · FairDrop happy path (the first policy, shown fast)**
- SAY: "This is the primitive's first policy — a fair launch you can't get locked out of. Google login, no seed phrase."
- SHOW: zkLogin → Register (Entry minted) → enter bid → **Commit**. The sealed-bid card appears: `5.0 SUI in escrow — ??? to everyone else`. The chain shows only a hash.

**[1:00–1:40] B · Live device-loss recovery — EMOTIONAL PEAK**
- SAY: "Now the moment. I lose this device."
- SHOW: **Simulate device loss** → key gone. Open the framing: *one 32-byte key opens this bid · no server, no team can open it · miss reveal and the escrow locks forever.*
- SAY: "Fresh browser, same Google login — zkLogin re-derives the same wallet. Then the chain decides."
- SHOW: **Recover** → sign the Seal session key → rail **Walrus → Seal → Restored** → `Bid recovered — 5.0 SUI. No server ever saw it.` Hold on this frame.

**[1:40–2:10] C · Randomness tie-break (Schran beat)**
- SAY: "Two bids tie at the clearing price. Who wins? Not us — the validators."
- SHOW: **Resolve** → result lands → click through to the resolve tx on SuiScan → point at **`sui::random` · 0x8**. SAY: "Validator DKG. Unbiasable. The outcome is on-chain and permanent."

**[2:10–2:45] D · THE SEAM — the hero beat**
- SAY: "None of that was special-cased. The recovery was gated by *this* — a real on-chain function the Seal key servers run."
- SHOW: the deployed `seal_approve` (≈10 lines). Then a 4-line diff strip — *swap the asserts → a new application*:
  - `FairDrop` (live): Entry owner, during reveal
  - `Umbra` (live): order owner, during reveal
  - `voting` (illustrative): member, before tally
  - `inheritance` (illustrative): anyone, after unlock_time
- SAY: "Two of these are deployed. The other two are one assert away. New policy, same engine."

**[2:45–3:15] E · Umbra side-by-side (the second policy = evidence of generality)**
- SAY: "Same primitive, second policy: confidential settlement. Same five-thousand-dollar swap, two outcomes."
- SHOW (left, static): a documented Cetus sandwich — victim broadcasts, bot front-runs, **−$42.17 extracted** (real-tx-backed).
- SHOW (right, live): **Submit** an Umbra order → the **32-byte hash** appears → `$0 extractable`. SAY: "The mempool sees a shadow. Nothing to front-run."

**[3:15–4:30] Real-world bookend (for the 50% weight — front-load on Demo Day)**
- SAY: "Why this matters: every encrypted on-chain secret today is one lost device from being gone forever — that's why nobody puts anything that matters behind on-chain encryption. We fixed the thing blocking the category. The first two policies are a fair launch and an MEV shield, but the primitive is the product: any access rule that can be written in Move can now gate a recoverable secret."

**[4:30–5:00] Close**
- SAY: "Seal made secrets programmable. We made them recoverable, and proved it twice on testnet, with no backend and no admin key. The auction and the swap are just the first two policies. Thank you."

---

## 4 · Judge-specific winning beats

### Kostas Chalkias — Seal
- **SHOW:** the real deployed `seal_approve`; the Walrus blob flow; the **live** recovery (Walrus read → Seal threshold decrypt → restore). Threshold **t = 2** — no single key server can decrypt.
- **SAY:** "Decryption is governed entirely by an on-chain Move policy — and the encrypted blob lives on Walrus, so the secret survives the device. Programmable privacy, made recoverable."
- **WHY:** It is a living demonstration of the Seal whitepaper thesis — not a toy that encrypts a string, but policy-governed secrets you can't lose.

### Sam Blackshear — Move
- **SHOW:** the non-transferable `Entry` object; policy enforced at the object level; PTB-atomic settlement; "no backend, no admin key" — verified on SuiScan.
- **SAY:** "Access control is an object you own plus an on-chain function, not a server check. Settlement is one PTB — everything or nothing — and no privileged key exists."
- **WHY:** It is the idiomatic Move story: capability-style objects + protocol-enforced policy, exactly how Move object ownership is meant to be used.

### Andrew Schran — sui::random
- **SHOW:** a staged clearing-price tie; **Resolve** fires; the resolve tx on SuiScan pointing at **`0x8`**.
- **SAY:** "When two bids tie, validator DKG randomness picks the winner — unpredictable before the transaction, unbiasable by us."
- **WHY:** Randomness visibly changes a *real economic outcome* on-chain, not a cosmetic animation.

### Deepak Maram — zkLogin
- **SHOW:** Google login → same wallet re-derived on a fresh browser (the recovery hinge); the per-registration nullifier committed on-chain; duplicate registration rejected.
- **SAY:** "zkLogin re-derives the same wallet on any device — that's what makes recovery walletless. It raises Sybil cost by gating entry behind OAuth. We do **not** claim proof-of-personhood."
- **WHY:** Honest, correct framing — the recovery mechanism depends on zkLogin's determinism, and the scoping is exactly right.

---

## 5 · Submission write-up

**Problem.** On-chain encryption has a fatal asymmetry: the moment a secret becomes useful — a sealed bid, a private order, a key — it also becomes losable. Lose the device that holds the decryption key and the secret is gone, permanently, because no server is allowed to hold it. That single failure mode is why almost nothing of value sits behind on-chain encryption today.

**The primitive.** We built a **recoverable, on-chain-policy-gated secret no server can read.** A client encrypts a nonce with **Seal** (threshold t = 2), stores the ciphertext on **Walrus**, and references the `blob_id` from an on-chain object. Decryption is released only when an on-chain Move function — `seal_approve` — approves the caller. Lose your device, sign in again (zkLogin re-derives the same wallet), and the chain itself authorizes the decrypt. The secret is recoverable, and *no backend, admin, or single key server can ever read it.*

**Why this is only possible on Sui.** Three Sui-native pieces compose into one guarantee no other stack offers together: **Seal** makes decryption a *programmable on-chain policy*; **Walrus** makes the ciphertext *device-independent* with no server; **object ownership + PTBs** make the access check a capability you hold and the settlement atomic. The trust assumption collapses to one thing: the Sui protocol itself.

**FairDrop (first policy, live).** A sealed-bid fair launch you can't get locked out of. Commit `sha3_256(amount ‖ nonce)`; clearing price = the lowest bid where cumulative supply ≥ total supply; exact ties broken by `sui::random`. The policy: *Entry owner, during the reveal window.*

**Umbra (second policy, live).** Confidential, MEV-resistant batch settlement. Orders are invisible until reveal, then clear at one uniform price in randomized order. The policy: *order owner, during the reveal window.* Built entirely during the hackathon period; it exists to prove the primitive generalizes, not to be "another DEX."

**The seam.** Both apps call the same engine and differ only in `seal_approve`. Swap the asserts and you get a new application from the same primitive — the deployed proof is FairDrop and Umbra sharing one engine across two policies.

**Honest scoping.** zkLogin raises Sybil cost by gating entry behind Google OAuth; it is **not** proof-of-personhood and we never claim "one human, one entry." Commit-reveal is temporary blinding, not permanent privacy. Voting, inheritance, and procurement are **illustrative** policies to show how little code changes — **not built, not claimed.**

**Why Sui, why now.** Seal's January 2026 whitepaper introduced *programmable privacy*. This is the missing half of that thesis: programmable privacy is only adoptable if the secrets are *recoverable*. We shipped that, on testnet, no backend.

**Track fit.** Walrus (recovery *is* Walrus as the verifiable, recoverable data layer) — with DeFi & Payments as the alternative (Umbra moves money confidentially and fairly).

---

## 6 · Defense Q&A (≤3 sentences each)

**1 · Can someone bypass the nullifier with multiple Google accounts?**
Yes — different Google accounts derive different addresses and pass as different entries. zkLogin *raises* Sybil cost by forcing OAuth per entry; it is not proof-of-personhood and we never claim it is. The nullifier dedups per (address, auction); it's an honesty floor, not an identity guarantee.

**2 · How is Umbra different from CoWSwap or Penumbra?**
Umbra isn't pitched as a better DEX — it's the *second policy* of a recoverable-secret primitive, and its order secrets are recoverable from Walrus if you lose your device, which encrypted-mempool DEXes don't offer. The novelty is the recoverable, policy-gated secret underneath; confidential settlement is one thing it enables.

**3 · What if Walrus or Seal is unavailable?**
The bid still lives in localStorage on the original device, so the happy path is unaffected; Walrus+Seal is the *recovery* layer for the device-loss case. Seal uses threshold t = 2, so one key server can be down and recovery still completes; if Walrus is fully unreachable, recovery waits, but no funds are lost (escrow is reclaimable on-chain).

**4 · What about griefing by never revealing?**
Non-revealers simply forfeit nothing they were owed — escrow is reclaimable after the reveal window via a permissionless `reclaim_escrow`, with a grace-period escape hatch so funds can never be stranded even if settlement never runs. It costs the griefer gas and their own escrow lockup for the window, and changes no honest outcome.

**5 · Is the randomness truly unbiasable?**
It's `sui::random` at `0x8` — validator distributed-key-generation randomness, consumed inside the settlement transaction, so no party (including us) can see or bias it before the outcome is fixed. You can verify the exact draw in the resolve tx on SuiScan.

**6 · Why does this need a blockchain at all?**
Because the guarantee is "no server can read or withhold the secret, and the rule that releases it is enforced by code, not a company" — that only exists if the policy runs on a permissionless protocol with no admin. Remove the chain and you're back to trusting a server, which is the exact failure mode we removed.

---

## 7 · Track-targeting copy

**Walrus track (2–3 sentences):**
Walrus isn't storage in this project — it's the recovery layer. By holding the Seal-encrypted secret as a device-independent blob referenced on-chain, Walrus is what lets a user lose their device and still recover an on-chain secret no server ever held. It is Walrus used as a *verifiable, recoverable data layer* for programmable on-chain privacy — demonstrated live across two deployed policies.

**DeFi & Payments track (2–3 sentences):**
Umbra is confidential, MEV-resistant settlement: orders are a 32-byte shadow until it's too late to attack, then clear at one fair price chosen with validator randomness — and, uniquely, an order you can recover from any device. It's a programmable payment rail where the access rule is on-chain Move code, not a server. The same primitive also powers FairDrop, a fair launch you can't get locked out of — evidence that this is reusable financial infrastructure, not a single app.
