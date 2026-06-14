#[test_only]
#[allow(untyped_literal, unused_use)]
module fairdrop::auction_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::sui::SUI;
    use sui::clock::{Self, Clock};
    use sui::random::{Self, Random};
    use sui::transfer;
    use fairdrop::auction::{
        Self, Auction, CreatorCap, Entry, Commitment, WinnerCertificate,
    };

    const COMMIT_END: u64 = 1_000;
    const REVEAL_END: u64 = 2_000;
    const MIN_BID:    u64 = 100;
    const SUPPLY:     u64 = 2;
    const GRACE_MS:   u64 = 3_600_000; // RECLAIM_GRACE_MS

    const CREATOR: address = @0xC;
    const ALICE:   address = @0xA;
    const BOB:     address = @0xB;
    const CAROL:   address = @0xC2;

    // ── Helpers ───────────────────────────────────────────────────────────────

    fun setup(s: &mut Scenario) {
        ts::next_tx(s, CREATOR);
        let clock = clock::create_for_testing(ts::ctx(s));
        clock::share_for_testing(clock);

        ts::next_tx(s, @0x0);
        random::create_for_testing(ts::ctx(s));

        ts::next_tx(s, CREATOR);
        auction::create_auction(SUPPLY, MIN_BID, COMMIT_END, REVEAL_END, ts::ctx(s));
    }

    fun register_bidder(s: &mut Scenario, bidder: address, nullifier: vector<u8>) {
        ts::next_tx(s, bidder);
        let mut auction = ts::take_shared<Auction>(s);
        auction::register(&mut auction, nullifier, ts::ctx(s));
        ts::return_shared(auction);
    }

    fun commit(s: &mut Scenario, bidder: address, hash: vector<u8>, amount: u64) {
        ts::next_tx(s, bidder);
        let mut auction = ts::take_shared<Auction>(s);
        let entry = ts::take_from_sender<Entry>(s);
        let clock = ts::take_shared<Clock>(s);
        let escrow = coin::mint_for_testing<SUI>(amount, ts::ctx(s));
        auction::commit_bid(&mut auction, &entry, hash, escrow, option::none(), &clock, ts::ctx(s));
        ts::return_shared(auction);
        ts::return_to_sender(s, entry);
        ts::return_shared(clock);
    }

    fun advance_clock_to(s: &mut Scenario, sender: address, ms: u64) {
        ts::next_tx(s, sender);
        let mut clock = ts::take_shared<Clock>(s);
        clock::set_for_testing(&mut clock, ms);
        ts::return_shared(clock);
    }

    fun reveal(s: &mut Scenario, bidder: address, amount: u64, nonce: vector<u8>) {
        ts::next_tx(s, bidder);
        let mut auction = ts::take_shared<Auction>(s);
        let commitment = ts::take_from_sender<Commitment>(s);
        let clock = ts::take_shared<Clock>(s);
        auction::reveal_bid(&mut auction, &commitment, amount, nonce, &clock, ts::ctx(s));
        ts::return_shared(auction);
        ts::return_to_sender(s, commitment);
        ts::return_shared(clock);
    }

    fun do_resolve_round(s: &mut Scenario, sender: address, round: u64) {
        ts::next_tx(s, @0x0);
        let mut rand = ts::take_shared<Random>(s);
        random::update_randomness_state_for_testing(
            &mut rand, round,
            x"1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F",
            ts::ctx(s),
        );
        ts::return_shared(rand);

        ts::next_tx(s, sender);
        let mut auction = ts::take_shared<Auction>(s);
        let rand = ts::take_shared<Random>(s);
        let clock = ts::take_shared<Clock>(s);
        auction::resolve(&mut auction, &rand, &clock, ts::ctx(s));
        ts::return_shared(auction);
        ts::return_shared(rand);
        ts::return_shared(clock);
    }

    fun do_resolve(s: &mut Scenario, sender: address) {
        do_resolve_round(s, sender, 0);
    }

    // sha3_256(amount_le_bytes || nonce) matching lib/hash.ts
    fun make_nonce(byte: u8): vector<u8> {
        let mut v = vector[];
        let mut i = 0u64;
        while (i < 32) { vector::push_back(&mut v, byte); i = i + 1; };
        v
    }

    fun make_hash(amount: u64, nonce_byte: u8): vector<u8> {
        let mut pre = std::bcs::to_bytes(&amount);
        vector::append(&mut pre, make_nonce(nonce_byte));
        std::hash::sha3_256(pre)
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    #[test]
    fun test_create_auction() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);

        ts::next_tx(&mut s, CREATOR);
        let auction = ts::take_shared<Auction>(&s);
        assert!(auction::auction_supply(&auction) == SUPPLY, 0);
        assert!(auction::auction_min_bid(&auction) == MIN_BID, 1);
        assert!(!auction::is_resolved(&auction), 2);
        ts::return_shared(auction);

        ts::next_tx(&mut s, CREATOR);
        let cap = ts::take_from_sender<CreatorCap>(&s);
        ts::return_to_sender(&s, cap);
        ts::end(s);
    }

    #[test]
    fun test_register_entry_minted() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");

        ts::next_tx(&mut s, ALICE);
        let entry = ts::take_from_sender<Entry>(&s);
        ts::return_to_sender(&s, entry);
        ts::end(s);
    }

    #[test, expected_failure(abort_code = fairdrop::auction::EAlreadyRegistered)]
    fun test_double_register_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"same_null");
        register_bidder(&mut s, BOB,   b"same_null");
        ts::end(s);
    }

    #[test]
    fun test_commit_stores_hash() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);

        ts::next_tx(&mut s, ALICE);
        let c = ts::take_from_sender<Commitment>(&s);
        assert!(option::is_none(auction::commitment_blob_id(&c)), 0);
        ts::return_to_sender(&s, c);
        ts::end(s);
    }

    #[test, expected_failure(abort_code = fairdrop::auction::EAlreadyCommitted)]
    fun test_double_commit_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        ts::end(s);
    }

    #[test, expected_failure(abort_code = fairdrop::auction::EBelowMinBid)]
    fun test_commit_below_min_bid_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(50, 1), 50);
        ts::end(s);
    }

    #[test, expected_failure(abort_code = fairdrop::auction::EPhaseEnded)]
    fun test_commit_after_deadline_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        ts::end(s);
    }

    #[test]
    fun test_reveal_accepted() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);

        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, make_nonce(1));

        ts::next_tx(&mut s, CREATOR);
        let auction = ts::take_shared<Auction>(&s);
        assert!(auction::reveal_count(&auction) == 1, 0);
        ts::return_shared(auction);
        ts::end(s);
    }

    #[test, expected_failure(abort_code = fairdrop::auction::EHashMismatch)]
    fun test_reveal_wrong_nonce_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, make_nonce(2)); // nonce_byte=2 ≠ committed 1
        ts::end(s);
    }

    #[test, expected_failure(abort_code = fairdrop::auction::EInsufficientEscrow)]
    fun test_reveal_amount_exceeds_escrow_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(500, 1), 200); // escrow=200, hash for 500
        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        reveal(&mut s, ALICE, 500, make_nonce(1));
        ts::end(s);
    }

    #[test, expected_failure(abort_code = fairdrop::auction::ETooEarly)]
    fun test_reveal_before_commit_ends_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        reveal(&mut s, ALICE, 200, make_nonce(1)); // clock still at 0
        ts::end(s);
    }

    #[test]
    fun test_reclaim_no_show() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        advance_clock_to(&mut s, CREATOR, REVEAL_END + 1);

        ts::next_tx(&mut s, ALICE);
        let auction = ts::take_shared<Auction>(&s);
        let c = ts::take_from_sender<Commitment>(&s);
        let clock = ts::take_shared<Clock>(&s);
        auction::reclaim_escrow(&auction, c, &clock, ts::ctx(&mut s));
        ts::return_shared(auction);
        ts::return_shared(clock);
        ts::end(s);
    }

    #[test]
    fun test_resolve_zero_reveals() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        advance_clock_to(&mut s, CREATOR, REVEAL_END + 1);
        do_resolve(&mut s, CREATOR);

        ts::next_tx(&mut s, CREATOR);
        let auction = ts::take_shared<Auction>(&s);
        assert!(auction::is_resolved(&auction), 0);
        ts::return_shared(auction);
        ts::end(s);
    }

    #[test]
    fun test_full_happy_path_two_winners() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);

        // Supply=2; bids: Bob(300)>Alice(200)>Carol(150); clearing=200
        register_bidder(&mut s, ALICE, b"alice_null");
        register_bidder(&mut s, BOB,   b"bob_null");
        register_bidder(&mut s, CAROL, b"carol_null");

        commit(&mut s, ALICE, make_hash(200, 1), 200);
        commit(&mut s, BOB,   make_hash(300, 2), 300);
        commit(&mut s, CAROL, make_hash(150, 3), 150);

        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, make_nonce(1));
        reveal(&mut s, BOB,   300, make_nonce(2));
        reveal(&mut s, CAROL, 150, make_nonce(3));

        advance_clock_to(&mut s, CREATOR, REVEAL_END + 1);
        do_resolve(&mut s, CREATOR);

        // Bob and Alice should have WinnerCertificates
        ts::next_tx(&mut s, BOB);
        let cert_bob = ts::take_from_sender<WinnerCertificate>(&s);
        ts::return_to_sender(&s, cert_bob);

        ts::next_tx(&mut s, ALICE);
        let cert_alice = ts::take_from_sender<WinnerCertificate>(&s);
        ts::return_to_sender(&s, cert_alice);

        // Carol reclaims escrow (loser)
        ts::next_tx(&mut s, CAROL);
        let auction = ts::take_shared<Auction>(&s);
        let carol_c = ts::take_from_sender<Commitment>(&s);
        let clock = ts::take_shared<Clock>(&s);
        auction::reclaim_escrow(&auction, carol_c, &clock, ts::ctx(&mut s));
        ts::return_shared(auction);
        ts::return_shared(clock);

        ts::end(s);
    }

    #[test]
    fun test_winner_claim_and_creator_withdraw() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);

        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, make_nonce(1));
        advance_clock_to(&mut s, CREATOR, REVEAL_END + 1);
        do_resolve(&mut s, CREATOR);

        // Alice claims
        ts::next_tx(&mut s, ALICE);
        let mut auction = ts::take_shared<Auction>(&s);
        let cert = ts::take_from_sender<WinnerCertificate>(&s);
        let comm = ts::take_from_sender<Commitment>(&s);
        auction::claim(&mut auction, cert, comm, ts::ctx(&mut s));
        ts::return_shared(auction);

        // Creator withdraws
        ts::next_tx(&mut s, CREATOR);
        let mut auction = ts::take_shared<Auction>(&s);
        let cap = ts::take_from_sender<CreatorCap>(&s);
        auction::withdraw_proceeds(&mut auction, &cap, ts::ctx(&mut s));
        ts::return_shared(auction);
        ts::return_to_sender(&s, cap);

        ts::end(s);
    }

    #[test, expected_failure(abort_code = fairdrop::auction::EAlreadyResolved)]
    fun test_double_resolve_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        advance_clock_to(&mut s, CREATOR, REVEAL_END + 1);
        do_resolve_round(&mut s, CREATOR, 0);
        do_resolve_round(&mut s, CREATOR, 1); // must abort EAlreadyResolved
        ts::end(s);
    }

    #[test, expected_failure(abort_code = fairdrop::auction::ENotResolved)]
    fun test_withdraw_before_resolve_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);

        ts::next_tx(&mut s, CREATOR);
        let mut auction = ts::take_shared<Auction>(&s);
        let cap = ts::take_from_sender<CreatorCap>(&s);
        auction::withdraw_proceeds(&mut auction, &cap, ts::ctx(&mut s));
        ts::return_shared(auction);
        ts::return_to_sender(&s, cap);
        ts::end(s);
    }

    // ── Security regression tests (one per patched vulnerability) ────────────

    // FIX 4: same sender cannot register twice with different nullifiers
    #[test, expected_failure(abort_code = fairdrop::auction::EAlreadyRegistered)]
    fun test_same_addr_double_register_different_nullifier_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"nullifier_one");
        register_bidder(&mut s, ALICE, b"nullifier_two"); // different nullifier, same address
        ts::end(s);
    }

    // FIX 2: cross-address reveal — attacker holds victim's Commitment but is not the bidder
    #[test, expected_failure(abort_code = fairdrop::auction::EUnauthorized)]
    fun test_cross_address_reveal_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);

        // Alice transfers her Commitment to Bob
        ts::next_tx(&mut s, ALICE);
        let commitment = ts::take_from_sender<Commitment>(&s);
        transfer::public_transfer(commitment, BOB);

        // Bob tries to reveal using Alice's Commitment (bidder=ALICE, sender=BOB)
        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        ts::next_tx(&mut s, BOB);
        let mut auction = ts::take_shared<Auction>(&s);
        let commitment = ts::take_from_sender<Commitment>(&s);
        let clock = ts::take_shared<Clock>(&s);
        auction::reveal_bid(&mut auction, &commitment, 200, make_nonce(1), &clock, ts::ctx(&mut s));
        ts::return_shared(auction);
        ts::return_to_sender(&s, commitment);
        ts::return_shared(clock);
        ts::end(s);
    }

    // FIX 3: winner cannot reclaim escrow instead of paying clearing_price via claim
    #[test, expected_failure(abort_code = fairdrop::auction::EWinnerCannotReclaim)]
    fun test_winner_cannot_reclaim_escrow() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);

        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, make_nonce(1));
        advance_clock_to(&mut s, CREATOR, REVEAL_END + 1);
        do_resolve(&mut s, CREATOR);

        // Alice won; she tries reclaim_escrow instead of claim → EWinnerCannotReclaim
        ts::next_tx(&mut s, ALICE);
        let auction = ts::take_shared<Auction>(&s);
        let commitment = ts::take_from_sender<Commitment>(&s);
        let clock = ts::take_shared<Clock>(&s);
        auction::reclaim_escrow(&auction, commitment, &clock, ts::ctx(&mut s));
        ts::return_shared(auction);
        ts::return_shared(clock);
        ts::end(s);
    }

    // FIX 3: revealer cannot reclaim while auction is unresolved (outcome unknown)
    #[test, expected_failure(abort_code = fairdrop::auction::ETooEarly)]
    fun test_revealer_must_wait_for_resolve_before_reclaim() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);

        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, make_nonce(1));

        // Post-reveal but nobody has called resolve yet
        advance_clock_to(&mut s, CREATOR, REVEAL_END + 1);

        ts::next_tx(&mut s, ALICE);
        let auction = ts::take_shared<Auction>(&s);
        let commitment = ts::take_from_sender<Commitment>(&s);
        let clock = ts::take_shared<Clock>(&s);
        auction::reclaim_escrow(&auction, commitment, &clock, ts::ctx(&mut s));
        ts::return_shared(auction);
        ts::return_shared(clock);
        ts::end(s);
    }

    // FIX 5a: claim requires certificate.winner == ctx.sender()
    #[test, expected_failure(abort_code = fairdrop::auction::EUnauthorized)]
    fun test_non_winner_cannot_claim() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);

        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, make_nonce(1));
        advance_clock_to(&mut s, CREATOR, REVEAL_END + 1);
        do_resolve(&mut s, CREATOR);

        // Bob acquires Alice's WinnerCertificate and Commitment via transfer
        ts::next_tx(&mut s, ALICE);
        let cert = ts::take_from_sender<WinnerCertificate>(&s);
        let comm = ts::take_from_sender<Commitment>(&s);
        transfer::public_transfer(cert, BOB);
        transfer::public_transfer(comm, BOB);

        // Bob calls claim — cert.winner=ALICE but ctx.sender()=BOB → EUnauthorized
        ts::next_tx(&mut s, BOB);
        let mut auction = ts::take_shared<Auction>(&s);
        let cert = ts::take_from_sender<WinnerCertificate>(&s);
        let comm = ts::take_from_sender<Commitment>(&s);
        auction::claim(&mut auction, cert, comm, ts::ctx(&mut s));
        ts::return_shared(auction);
        ts::end(s);
    }

    // FIX 5b: reclaim_escrow requires commitment.bidder == ctx.sender()
    #[test, expected_failure(abort_code = fairdrop::auction::EUnauthorized)]
    fun test_non_bidder_cannot_reclaim() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);

        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);

        // Alice transfers her Commitment to Bob
        ts::next_tx(&mut s, ALICE);
        let commitment = ts::take_from_sender<Commitment>(&s);
        transfer::public_transfer(commitment, BOB);

        // Bob calls reclaim_escrow — commitment.bidder=ALICE, ctx.sender()=BOB → EUnauthorized
        advance_clock_to(&mut s, CREATOR, REVEAL_END + 1);
        ts::next_tx(&mut s, BOB);
        let auction = ts::take_shared<Auction>(&s);
        let comm = ts::take_from_sender<Commitment>(&s);
        let clock = ts::take_shared<Clock>(&s);
        auction::reclaim_escrow(&auction, comm, &clock, ts::ctx(&mut s));
        ts::return_shared(auction);
        ts::return_shared(clock);
        ts::end(s);
    }

    // ── Hardening: overflow guard ────────────────────────────────────────────────

    // Revealing an amount above MAX_AMOUNT is rejected (keeps clearing_price *
    // winner_count from overflowing u64 in resolve).
    #[test, expected_failure(abort_code = fairdrop::auction::EAmountTooLarge)]
    fun test_reveal_amount_too_large_fails() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        // escrow covers the amount; the cap (not escrow) is what rejects it.
        commit(&mut s, ALICE, make_hash(1_000_000_000_000_001, 1), 1_000_000_000_000_001);
        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        reveal(&mut s, ALICE, 1_000_000_000_000_001, make_nonce(1));
        ts::end(s);
    }

    // ── Hardening: revealer escape hatch (no permanent lock if resolve never runs) ─

    #[test]
    fun test_revealer_reclaim_after_grace_when_unresolved() {
        let mut s = ts::begin(CREATOR);
        setup(&mut s);
        register_bidder(&mut s, ALICE, b"alice_null");
        commit(&mut s, ALICE, make_hash(200, 1), 200);
        advance_clock_to(&mut s, CREATOR, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, make_nonce(1));

        // Past reveal_end + grace, resolve never called → Alice still gets her escrow.
        advance_clock_to(&mut s, CREATOR, REVEAL_END + GRACE_MS + 1);
        ts::next_tx(&mut s, ALICE);
        let auction = ts::take_shared<Auction>(&s);
        let c = ts::take_from_sender<Commitment>(&s);
        let clock = ts::take_shared<Clock>(&s);
        auction::reclaim_escrow(&auction, c, &clock, ts::ctx(&mut s));
        ts::return_shared(auction);
        ts::return_shared(clock);
        ts::end(s);
    }
}
