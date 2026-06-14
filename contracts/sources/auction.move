#[allow(lint(self_transfer))]
module fairdrop::auction {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::random::{Self, Random};
    use sui::table::{Self, Table};
    use sui::vec_map::{Self, VecMap};
    use sui::clock::{Self, Clock};
    use sui::event;

    // ── Error codes ──────────────────────────────────────────────────────────
    const EAlreadyRegistered:   u64 = 1;
    const EAlreadyCommitted:    u64 = 2;
    const EHashMismatch:        u64 = 3;
    const EPhaseEnded:          u64 = 4;
    const ETooEarly:            u64 = 5;
    const EAlreadyResolved:     u64 = 6;
    const EBelowMinBid:         u64 = 7;
    const ENotResolved:         u64 = 8;
    const EUnauthorized:        u64 = 9;
    const EWrongAuction:        u64 = 10;
    const EInsufficientEscrow:  u64 = 11;
    const EWinnerCannotReclaim: u64 = 12;
    const ETooManyReveals:      u64 = 13;   // reveals at MAX_REVEALS (anti-OOG)
    const EAmountTooLarge:      u64 = 14;   // revealed amount > MAX_AMOUNT (overflow guard)

    // ── Hard bounds (resolve OOG + overflow guards) ──────────────────────────
    const MAX_REVEALS: u64 = 256;                    // bounds resolve's O(n^2) sort + cert minting
    const MAX_AMOUNT:  u64 = 1_000_000_000_000_000;  // 1e15 MIST = 1M SUI per bid; MAX_AMOUNT*MAX_REVEALS < u64::MAX
    const RECLAIM_GRACE_MS: u64 = 3_600_000;         // 1h past reveal_end before an unresolved reclaim

    // ── Shared state ─────────────────────────────────────────────────────────
    #[allow(lint(coin_field))]
    public struct Auction has key {
        id: UID,
        creator: address,
        supply: u64,
        min_bid: u64,
        commit_end_ms: u64,
        reveal_end_ms: u64,
        registered_nullifiers: Table<vector<u8>, bool>,
        registered_addrs: Table<address, bool>,     // one registration per sender
        commitments: Table<address, vector<u8>>,
        reveals: VecMap<address, u64>,
        winners: Table<address, bool>,              // populated by resolve; guards reclaim
        proceeds: Coin<SUI>,
        resolved: bool,
    }

    // ── Owned objects ────────────────────────────────────────────────────────
    public struct CreatorCap has key, store {
        id: UID,
        auction_id: ID,
    }

    // Entry: no `store` — cannot be transferred after minting; permanently bound to registrant.
    // Prevents Entry-reuse Sybil attack (one registration cannot enable multiple commits).
    public struct Entry has key {
        id: UID,
        auction_id: ID,
        nullifier_hash: vector<u8>,
        owner: address,
    }

    #[allow(lint(coin_field))]
    public struct Commitment has key, store {
        id: UID,
        auction_id: ID,
        bidder: address,
        commitment_hash: vector<u8>,
        escrow: Coin<SUI>,
        blob_id: Option<vector<u8>>,   // Walrus blob ID for Seal-encrypted nonce backup
    }

    public struct WinnerCertificate has key, store {
        id: UID,
        auction_id: ID,
        winner: address,
        clearing_price: u64,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    public struct AuctionCreated has copy, drop {
        auction_id: ID,
        creator: address,
        supply: u64,
    }

    public struct BidderRegistered has copy, drop {
        auction_id: ID,
        bidder: address,
    }

    public struct BidCommitted has copy, drop {
        auction_id: ID,
        bidder: address,
        // amount intentionally omitted — must not leak during commit phase
    }

    public struct BidRevealed has copy, drop {
        auction_id: ID,
        bidder: address,
        amount: u64,
    }

    public struct AuctionResolved has copy, drop {
        auction_id: ID,
        winner_count: u64,
        clearing_price: u64,
        total_proceeds: u64,
    }

    // ── F-1: Auction creation ─────────────────────────────────────────────────
    public fun create_auction(
        supply: u64,
        min_bid: u64,
        commit_end_ms: u64,
        reveal_end_ms: u64,
        ctx: &mut TxContext,
    ) {
        assert!(reveal_end_ms > commit_end_ms, EPhaseEnded);

        let auction_uid = object::new(ctx);
        let auction_id = object::uid_to_inner(&auction_uid);

        let auction = Auction {
            id: auction_uid,
            creator: ctx.sender(),
            supply,
            min_bid,
            commit_end_ms,
            reveal_end_ms,
            registered_nullifiers: table::new(ctx),
            registered_addrs: table::new(ctx),
            commitments: table::new(ctx),
            reveals: vec_map::empty(),
            winners: table::new(ctx),
            proceeds: coin::zero(ctx),
            resolved: false,
        };

        let cap = CreatorCap {
            id: object::new(ctx),
            auction_id,
        };

        event::emit(AuctionCreated { auction_id, creator: ctx.sender(), supply });

        transfer::share_object(auction);
        transfer::transfer(cap, ctx.sender());
    }

    // ── F-2: zkLogin registration ─────────────────────────────────────────────
    // nullifier_hash = sha3_256(google_sub || auction_id_bytes) — computed client-side
    public fun register(
        auction: &mut Auction,
        nullifier_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(!table::contains(&auction.registered_nullifiers, nullifier_hash), EAlreadyRegistered);
        assert!(!table::contains(&auction.registered_addrs, ctx.sender()), EAlreadyRegistered);

        table::add(&mut auction.registered_nullifiers, nullifier_hash, true);
        table::add(&mut auction.registered_addrs, ctx.sender(), true);

        let entry = Entry {
            id: object::new(ctx),
            auction_id: object::id(auction),
            nullifier_hash,
            owner: ctx.sender(),
        };

        event::emit(BidderRegistered { auction_id: object::id(auction), bidder: ctx.sender() });

        transfer::transfer(entry, ctx.sender());
    }

    // ── F-3: Blind bid commitment ─────────────────────────────────────────────
    // commitment_hash = sha3_256(amount_le_bytes || nonce_32_bytes) — computed client-side
    // blob_id: Walrus blob ID of Seal-encrypted nonce (none if Walrus unavailable)
    public fun commit_bid(
        auction: &mut Auction,
        entry: &Entry,
        commitment_hash: vector<u8>,
        escrow: Coin<SUI>,
        blob_id: Option<vector<u8>>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(entry.auction_id == object::id(auction), EWrongAuction);
        assert!(entry.owner == ctx.sender(), EUnauthorized);
        assert!(clock::timestamp_ms(clock) < auction.commit_end_ms, EPhaseEnded);
        assert!(coin::value(&escrow) >= auction.min_bid, EBelowMinBid);
        assert!(!table::contains(&auction.commitments, ctx.sender()), EAlreadyCommitted);

        table::add(&mut auction.commitments, ctx.sender(), commitment_hash);

        let commitment = Commitment {
            id: object::new(ctx),
            auction_id: object::id(auction),
            bidder: ctx.sender(),
            commitment_hash,
            escrow,
            blob_id,
        };

        event::emit(BidCommitted { auction_id: object::id(auction), bidder: ctx.sender() });

        transfer::transfer(commitment, ctx.sender());
    }

    // ── F-4: Bid reveal ───────────────────────────────────────────────────────
    public fun reveal_bid(
        auction: &mut Auction,
        commitment: &Commitment,
        amount: u64,
        nonce: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(commitment.auction_id == object::id(auction), EWrongAuction);
        assert!(commitment.bidder == ctx.sender(), EUnauthorized);
        let now = clock::timestamp_ms(clock);
        assert!(now >= auction.commit_end_ms, ETooEarly);
        assert!(now < auction.reveal_end_ms, EPhaseEnded);
        assert!(coin::value(&commitment.escrow) >= amount, EInsufficientEscrow);
        // Bounds: cap the batch so resolve fits one PTB, and cap the amount so
        // clearing_price * winner_count can never overflow u64 in resolve.
        assert!(amount <= MAX_AMOUNT, EAmountTooLarge);
        assert!(vec_map::length(&auction.reveals) < MAX_REVEALS, ETooManyReveals);

        // Verify sha3_256(amount_le_bytes || nonce) matches stored commitment
        let mut preimage = std::bcs::to_bytes(&amount);
        std::vector::append(&mut preimage, nonce);
        let expected_hash = std::hash::sha3_256(preimage);
        assert!(expected_hash == commitment.commitment_hash, EHashMismatch);

        vec_map::insert(&mut auction.reveals, ctx.sender(), amount);

        event::emit(BidRevealed { auction_id: object::id(auction), bidder: ctx.sender(), amount });
    }

    // ── F-5: Resolution ───────────────────────────────────────────────────────
    // Callable by anyone after reveal_end_ms.
    #[allow(lint(public_random))]
    public fun resolve(
        auction: &mut Auction,
        rand: &Random,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!auction.resolved, EAlreadyResolved);
        assert!(clock::timestamp_ms(clock) >= auction.reveal_end_ms, ETooEarly);

        // Set resolved before any transfers (double-resolve guard)
        auction.resolved = true;

        let n = vec_map::length(&auction.reveals);
        if (n == 0) {
            event::emit(AuctionResolved {
                auction_id: object::id(auction),
                winner_count: 0,
                clearing_price: 0,
                total_proceeds: 0,
            });
            return
        };

        // Collect reveals into two parallel vectors (Move has no vector<tuple>)
        let mut bid_addrs: vector<address> = vector[];
        let mut bid_amts: vector<u64> = vector[];
        let mut i = 0;
        while (i < n) {
            let (addr, amt) = vec_map::get_entry_by_idx(&auction.reveals, i);
            vector::push_back(&mut bid_addrs, *addr);
            vector::push_back(&mut bid_amts, *amt);
            i = i + 1;
        };

        // Insertion sort descending by amount, keeping both vectors in sync
        let len = vector::length(&bid_amts);
        let mut j = 1;
        while (j < len) {
            let mut k = j;
            while (k > 0) {
                let amt_k    = *vector::borrow(&bid_amts, k);
                let amt_prev = *vector::borrow(&bid_amts, k - 1);
                if (amt_k > amt_prev) {
                    vector::swap(&mut bid_amts, k, k - 1);
                    vector::swap(&mut bid_addrs, k, k - 1);
                    k = k - 1;
                } else {
                    break
                }
            };
            j = j + 1;
        };

        // winners_needed = min(supply, n)
        let supply = auction.supply;
        let winners_needed = if (n < supply) { n } else { supply };

        // clearing_price = amount at index (winners_needed - 1) in sorted desc order
        let clearing_price = *vector::borrow(&bid_amts, winners_needed - 1);

        // Count unambiguous winners (strictly above clearing price)
        let mut unambiguous: u64 = 0;
        let mut q = 0;
        while (q < winners_needed) {
            if (*vector::borrow(&bid_amts, q) > clearing_price) {
                unambiguous = unambiguous + 1;
            };
            q = q + 1;
        };

        let marginal_needed = winners_needed - unambiguous;

        // Collect addresses tied at exactly clearing_price into a shuffle pool
        let mut marginal_pool: vector<address> = vector[];
        let mut m = 0;
        while (m < len) {
            if (*vector::borrow(&bid_amts, m) == clearing_price) {
                vector::push_back(&mut marginal_pool, *vector::borrow(&bid_addrs, m));
            };
            m = m + 1;
        };

        // Fisher-Yates shuffle of marginal_pool using sui::random
        let mut rng = random::new_generator(rand, ctx);
        let mut s = vector::length(&marginal_pool);
        while (s > 1) {
            let pick = (random::generate_u64_in_range(&mut rng, 0, (s as u64) - 1)) as u64;
            vector::swap(&mut marginal_pool, s - 1, pick);
            s = s - 1;
        };

        // Build winner set: all strictly-above-clearing + first marginal_needed from shuffled pool
        let mut winner_set: vector<address> = vector[];
        let mut w = 0;
        while (w < len) {
            if (*vector::borrow(&bid_amts, w) > clearing_price) {
                vector::push_back(&mut winner_set, *vector::borrow(&bid_addrs, w));
            };
            w = w + 1;
        };
        let mut p = 0;
        while (p < marginal_needed) {
            vector::push_back(&mut winner_set, *vector::borrow(&marginal_pool, p));
            p = p + 1;
        };

        let actual_winner_count = vector::length(&winner_set);
        let total_proceeds = clearing_price * (actual_winner_count as u64);

        // Mint WinnerCertificate for each winner and record in winners table
        let mut cert_w = 0;
        while (cert_w < actual_winner_count) {
            let winner_addr = *vector::borrow(&winner_set, cert_w);
            let cert = WinnerCertificate {
                id: object::new(ctx),
                auction_id: object::id(auction),
                winner: winner_addr,
                clearing_price,
            };
            transfer::transfer(cert, winner_addr);
            table::add(&mut auction.winners, winner_addr, true);
            cert_w = cert_w + 1;
        };

        event::emit(AuctionResolved {
            auction_id: object::id(auction),
            winner_count: actual_winner_count as u64,
            clearing_price,
            total_proceeds,
        });
    }

    // ── F-6: Winner claims allocation + settles escrow ────────────────────────
    // Winner consumes WinnerCertificate + Commitment.
    // clearing_price goes to proceeds; remainder of escrow refunded to winner.
    public fun claim(
        auction: &mut Auction,
        certificate: WinnerCertificate,
        commitment: Commitment,
        ctx: &mut TxContext,
    ) {
        assert!(certificate.auction_id == object::id(auction), EWrongAuction);
        assert!(commitment.auction_id == object::id(auction), EWrongAuction);
        assert!(auction.resolved, ENotResolved);
        assert!(certificate.winner == ctx.sender(), EUnauthorized);

        let clearing_price = certificate.clearing_price;
        let WinnerCertificate { id: cert_id, auction_id: _, winner: _, clearing_price: _ } = certificate;
        object::delete(cert_id);

        let Commitment { id: comm_id, auction_id: _, bidder: _, commitment_hash: _, escrow, blob_id: _ } = commitment;
        object::delete(comm_id);

        let mut escrow_mut = escrow;
        let payment = coin::split(&mut escrow_mut, clearing_price, ctx);
        coin::join(&mut auction.proceeds, payment);

        if (coin::value(&escrow_mut) > 0) {
            transfer::public_transfer(escrow_mut, ctx.sender());
        } else {
            coin::destroy_zero(escrow_mut);
        };
    }

    // ── F-7: Creator withdraws proceeds ──────────────────────────────────────
    public fun withdraw_proceeds(
        auction: &mut Auction,
        cap: &CreatorCap,
        ctx: &mut TxContext,
    ) {
        assert!(cap.auction_id == object::id(auction), EUnauthorized);
        assert!(auction.resolved, ENotResolved);

        let amount = coin::value(&auction.proceeds);
        if (amount > 0) {
            let payout = coin::split(&mut auction.proceeds, amount, ctx);
            transfer::public_transfer(payout, auction.creator);
        };
    }

    // ── Loser / no-show escrow reclaim ────────────────────────────────────────
    // Losers (revealed but lost) and no-shows (never revealed) use this.
    // Winners must use claim() — reclaim is blocked for addresses in auction.winners.
    // Revealers who have not yet seen a resolve must wait: outcome unknown until resolve.
    public fun reclaim_escrow(
        auction: &Auction,
        commitment: Commitment,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(commitment.auction_id == object::id(auction), EWrongAuction);
        assert!(commitment.bidder == ctx.sender(), EUnauthorized);

        let post_reveal = clock::timestamp_ms(clock) >= auction.reveal_end_ms;
        assert!(auction.resolved || post_reveal, ETooEarly);

        // Anyone who revealed must wait for resolve (outcome unknown until then).
        // Post-resolve: winners are blocked; losers may reclaim.
        let sender = ctx.sender();
        if (vec_map::contains(&auction.reveals, &sender)) {
            // A revealer normally waits for resolve (outcome unknown until then). But if
            // resolve never ran — griefed or abandoned — allow reclaim after a grace
            // period so escrow can NEVER be permanently stranded.
            let post_grace = clock::timestamp_ms(clock) >= auction.reveal_end_ms + RECLAIM_GRACE_MS;
            assert!(auction.resolved || post_grace, ETooEarly);
            if (auction.resolved) {
                assert!(!table::contains(&auction.winners, sender), EWinnerCannotReclaim);
            };
        };

        let Commitment { id, auction_id: _, bidder: _, commitment_hash: _, escrow, blob_id: _ } = commitment;
        object::delete(id);
        transfer::public_transfer(escrow, ctx.sender());
    }

    // ── View helpers ──────────────────────────────────────────────────────────
    public fun auction_supply(auction: &Auction): u64 { auction.supply }
    public fun auction_min_bid(auction: &Auction): u64 { auction.min_bid }
    public fun commit_end_ms(auction: &Auction): u64 { auction.commit_end_ms }
    public fun reveal_end_ms(auction: &Auction): u64 { auction.reveal_end_ms }
    public fun is_resolved(auction: &Auction): bool { auction.resolved }
    public fun reveal_count(auction: &Auction): u64 { vec_map::length(&auction.reveals) }
    public fun commitment_blob_id(c: &Commitment): &Option<vector<u8>> { &c.blob_id }
    public fun entry_auction_id(e: &Entry): ID { e.auction_id }
}
