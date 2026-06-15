# FairDrop × Umbra — Architecture

> **One primitive, two applications.** A *recoverable, on-chain-policy-gated secret no
> server can read* — `Seal` (threshold encryption) + `Walrus` (off-chain blob storage)
> + `sui::random` (verifiable settlement). FairDrop wears the policy *"Entry owner during
> reveal."* Umbra wears *"order owner during reveal."* Same engine. Different policy.

---

## System diagram

```mermaid
flowchart TB
  classDef user   fill:#ffffff,stroke:#09090b,stroke-width:2px,color:#09090b;
  classDef app    fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e3a8a;
  classDef seal   fill:#fdf4ff,stroke:#c026d3,stroke-width:1.5px,color:#86198f;
  classDef walrus fill:#ecfeff,stroke:#0891b2,stroke-width:1.5px,color:#155e75;
  classDef chain  fill:#f0fdf4,stroke:#16a34a,stroke-width:1.5px,color:#166534;
  classDef danger fill:#fef2f2,stroke:#dc2626,stroke-width:1.5px,color:#991b1b;

  subgraph Z1["① USER ACTION"]
    direction LR
    U["Sign in with Google<br/>zkLogin · walletless"]:::user
    FD["FairDrop<br/><b>sealed BID</b>"]:::app
    UM["Umbra<br/><b>sealed ORDER</b>"]:::app
    U --> FD
    U --> UM
  end

  H["Client computes<br/><code>sha3_256(value ‖ nonce)</code>"]:::user
  FD --> H
  UM --> H

  subgraph Z2["② KEY SERVER · Seal (threshold t = 2)"]
    direction TB
    ENC["Seal.encrypt(nonce)<br/>bound to packageId + pool/auction id"]:::seal
    POL["<b>seal_approve()</b> — on-chain policy gate<br/>FairDrop: owns Entry &amp; now &lt; reveal_end<br/>Umbra: owns SealedOrder &amp; now &lt; reveal_end"]:::seal
  end

  subgraph Z3["③ OFF-CHAIN STORAGE · Walrus"]
    BLOB["Encrypted nonce blob<br/>returns <code>blob_id</code>"]:::walrus
  end

  subgraph Z4["④ ON-CHAIN SETTLEMENT · Sui"]
    direction TB
    COMMIT["<b>Commit</b><br/>hash + SUI escrow + blob_id<br/>(no amount on-chain)"]:::chain
    REVEAL["<b>Reveal</b><br/>value + nonce → re-hash &amp; verify"]:::chain
    RAND["<b>sui::random</b> · 0x8<br/>validator DKG"]:::chain
    PTB["<b>resolve / settle</b> — single PTB<br/>uniform clearing price"]:::chain
    NFT["Mint via <b>sui::display</b><br/>WinnerCertificate / MevShield NFT"]:::chain
    COMMIT --> REVEAL --> PTB
    RAND --> PTB --> NFT
  end

  %% happy path
  H --> ENC
  H --> COMMIT
  ENC --> BLOB
  BLOB -. blob_id written on-chain .-> COMMIT
  REVEAL -.-> PTB

  %% recovery path (the headline beat)
  LOST["Device lost · localStorage cleared"]:::danger
  LOST -. "1 · read blob" .-> BLOB
  BLOB -. "2 · ciphertext" .-> POL
  POL -- "3 · approves owner only" --> DEC["Seal releases key<br/>→ decrypt nonce"]:::seal
  DEC -- "4 · restore &amp; reveal" --> REVEAL
```

---

## The insight — one engine, two policies

```mermaid
flowchart LR
  classDef eng fill:#eff6ff,stroke:#2563eb,stroke-width:2px,color:#1e3a8a;
  classDef pol fill:#ffffff,stroke:#09090b,color:#09090b;

  ENG["<b>Recoverable, policy-gated secret</b><br/>commit-reveal · Seal · Walrus · sui::random"]:::eng
  P1["Policy: Entry owner,<br/>during reveal"]:::pol
  P2["Policy: order owner,<br/>during reveal"]:::pol
  P3["Policy: heir,<br/>after silence"]:::pol
  P4["Policy: voter,<br/>before tally"]:::pol

  ENG -->|swap the assert| P1 --> A1["FairDrop<br/>fair launch"]
  ENG -->|swap the assert| P2 --> A2["Umbra<br/>MEV-proof swap"]
  ENG -.future.-> P3 -.-> A3["Inheritance vault"]
  ENG -.future.-> P4 -.-> A4["Sealed governance"]
```

---

## Recovery sequence — "lose your device, keep your bid"

```mermaid
sequenceDiagram
  autonumber
  participant U as User (new device)
  participant W as Walrus
  participant S as Seal key servers (t=2)
  participant C as Sui chain
  U->>C: SessionKey signed (personal message)
  U->>W: read blob_id
  W-->>U: encrypted nonce (ciphertext)
  U->>S: decrypt request + seal_approve tx bytes
  S->>C: dry-run seal_approve(owner, reveal_window)
  C-->>S: OK — caller owns Entry/Order, window open
  S-->>U: release decryption key
  U->>U: decrypt nonce → restore bid/order
  U->>C: reveal(value, nonce) — verified on-chain
```

---

## Trust properties (what each zone guarantees)

| Zone | Component | Guarantee |
|---|---|---|
| ① User | zkLogin (Enoki) | Walletless entry; same login re-derives the same address on any device |
| ② Seal | threshold `t = 2` | No single key server can decrypt; release gated by an **on-chain** `seal_approve` |
| ③ Walrus | decentralized blobs | The encrypted nonce survives device loss — no team server holds it |
| ④ Sui | commit-reveal + `0x8` + PTB | Amounts hidden until reveal; winner selection is validator-DKG random; settlement is pull-based, no admin override |

**Net:** the secret is recoverable (Walrus), unreadable by any custodian (Seal `t=2` + policy),
and settled fairly and verifiably (commit-reveal + `sui::random`). No backend anywhere in the path.
