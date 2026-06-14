#[test_only]
#[allow(unused_use)]
module umbra::umbra_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::clock::{Self, Clock};
    use sui::random::{Self, Random};
    use sui::transfer;
    use umbra::umb::UMB;
    use umbra::umbra_swap::{
        Self, SwapPool, MakerCap, SealedOrder, MevShieldNFT,
    };

    const COMMIT_END: u64 = 1_000;
    const REVEAL_END: u64 = 2_000;
    const MIN_PRICE:  u64 = 100;
    const SUPPLY:     u64 = 10;   // UMB units available

    const MAKER: address = @0xE;
    const ALICE: address = @0xA;
    const BOB:   address = @0xB;
    const CAROL: address = @0xC;

    const IMG: vector<u8> = b"https://umbra.example/shield.png";

    // ── Helpers ───────────────────────────────────────────────────────────────

    fun setup(s: &mut Scenario, supply: u64) {
        ts::next_tx(s, MAKER);
        let clock = clock::create_for_testing(ts::ctx(s));
        clock::share_for_testing(clock);

        ts::next_tx(s, @0x0);
        random::create_for_testing(ts::ctx(s));

        ts::next_tx(s, MAKER);
        let inventory = coin::mint_for_testing<UMB>(supply, ts::ctx(s));
        umbra_swap::create_pool(inventory, supply, MIN_PRICE, COMMIT_END, REVEAL_END, ts::ctx(s));
    }

    fun submit(s: &mut Scenario, taker: address, hash: vector<u8>, escrow_amt: u64) {
        ts::next_tx(s, taker);
        let mut pool = ts::take_shared<SwapPool>(s);
        let clock = ts::take_shared<Clock>(s);
        let escrow = coin::mint_for_testing<SUI>(escrow_amt, ts::ctx(s));
        umbra_swap::submit_order(&mut pool, hash, escrow, option::none(), &clock, ts::ctx(s));
        ts::return_shared(pool);
        ts::return_shared(clock);
    }

    fun reveal(s: &mut Scenario, taker: address, price: u64, qty: u64, nonce: vector<u8>) {
        ts::next_tx(s, taker);
        let mut pool = ts::take_shared<SwapPool>(s);
        let order = ts::take_from_sender<SealedOrder>(s);
        let clock = ts::take_shared<Clock>(s);
        umbra_swap::reveal_order(&mut pool, &order, price, qty, nonce, &clock, ts::ctx(s));
        ts::return_shared(pool);
        ts::return_to_sender(s, order);
        ts::return_shared(clock);
    }

    fun advance_clock_to(s: &mut Scenario, ms: u64) {
        ts::next_tx(s, MAKER);
        let mut clock = ts::take_shared<Clock>(s);
        clock::set_for_testing(&mut clock, ms);
        ts::return_shared(clock);
    }

    fun do_settle(s: &mut Scenario, round: u64) {
        ts::next_tx(s, @0x0);
        let mut rand = ts::take_shared<Random>(s);
        random::update_randomness_state_for_testing(
            &mut rand, round,
            x"1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F1F",
            ts::ctx(s),
        );
        ts::return_shared(rand);

        ts::next_tx(s, MAKER);
        let mut pool = ts::take_shared<SwapPool>(s);
        let rand = ts::take_shared<Random>(s);
        let clock = ts::take_shared<Clock>(s);
        umbra_swap::settle(&mut pool, &rand, &clock, ts::ctx(s));
        ts::return_shared(pool);
        ts::return_shared(rand);
        ts::return_shared(clock);
    }

    // claim and leave outputs with the sender; returns nothing
    fun claim(s: &mut Scenario, taker: address) {
        ts::next_tx(s, taker);
        let mut pool = ts::take_shared<SwapPool>(s);
        let order = ts::take_from_sender<SealedOrder>(s);
        umbra_swap::claim_fill(&mut pool, order, option::none(), IMG, ts::ctx(s));
        ts::return_shared(pool);
    }

    fun make_nonce(byte: u8): vector<u8> {
        let mut v = vector[];
        let mut i = 0u64;
        while (i < 32) { vector::push_back(&mut v, byte); i = i + 1; };
        v
    }

    // sha3_256(price_le ‖ qty_le ‖ nonce) — mirrors reveal_order
    fun make_hash(price: u64, qty: u64, nonce_byte: u8): vector<u8> {
        let mut pre = std::bcs::to_bytes(&price);
        vector::append(&mut pre, std::bcs::to_bytes(&qty));
        vector::append(&mut pre, make_nonce(nonce_byte));
        std::hash::sha3_256(pre)
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    #[test]
    fun test_create_pool() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);

        ts::next_tx(&mut s, MAKER);
        let pool = ts::take_shared<SwapPool>(&s);
        assert!(umbra_swap::supply_units(&pool) == SUPPLY, 0);
        assert!(umbra_swap::min_price(&pool) == MIN_PRICE, 1);
        assert!(!umbra_swap::is_settled(&pool), 2);
        ts::return_shared(pool);

        ts::next_tx(&mut s, MAKER);
        let cap = ts::take_from_sender<MakerCap>(&s);
        ts::return_to_sender(&s, cap);
        ts::end(s);
    }

    #[test]
    fun test_submit_mints_sealed_order() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        submit(&mut s, ALICE, make_hash(200, 4, 1), 800);

        ts::next_tx(&mut s, ALICE);
        let order = ts::take_from_sender<SealedOrder>(&s);
        assert!(option::is_none(umbra_swap::order_blob_id(&order)), 0);
        ts::return_to_sender(&s, order);
        ts::end(s);
    }

    #[test, expected_failure(abort_code = umbra::umbra_swap::EAlreadyOrdered)]
    fun test_double_submit_fails() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        submit(&mut s, ALICE, make_hash(200, 4, 1), 800);
        submit(&mut s, ALICE, make_hash(200, 4, 1), 800);
        ts::end(s);
    }

    // ── Reveal guards ───────────────────────────────────────────────────────────

    #[test, expected_failure(abort_code = umbra::umbra_swap::EBelowMinPrice)]
    fun test_reveal_below_min_price_fails() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        submit(&mut s, ALICE, make_hash(50, 4, 1), 800);   // price 50 < min 100
        advance_clock_to(&mut s, COMMIT_END + 1);
        reveal(&mut s, ALICE, 50, 4, make_nonce(1));
        ts::end(s);
    }

    #[test, expected_failure(abort_code = umbra::umbra_swap::EHashMismatch)]
    fun test_reveal_wrong_nonce_fails() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        submit(&mut s, ALICE, make_hash(200, 4, 1), 800);
        advance_clock_to(&mut s, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, 4, make_nonce(2));     // nonce 2 ≠ committed 1
        ts::end(s);
    }

    #[test, expected_failure(abort_code = umbra::umbra_swap::EInsufficientEscrow)]
    fun test_reveal_insufficient_escrow_fails() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        submit(&mut s, ALICE, make_hash(200, 4, 1), 500);  // escrow 500 < 200*4=800
        advance_clock_to(&mut s, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, 4, make_nonce(1));
        ts::end(s);
    }

    #[test, expected_failure(abort_code = umbra::umbra_swap::ETooEarly)]
    fun test_reveal_before_commit_end_fails() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        submit(&mut s, ALICE, make_hash(200, 4, 1), 800);
        reveal(&mut s, ALICE, 200, 4, make_nonce(1));      // clock still at 0
        ts::end(s);
    }

    #[test, expected_failure(abort_code = umbra::umbra_swap::EWrongPool)]
    fun test_reveal_wrong_pool_fails() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        submit(&mut s, ALICE, make_hash(200, 4, 1), 800);

        // Spin up a SECOND pool; reveal Alice's (pool A) order against pool B.
        ts::next_tx(&mut s, MAKER);
        let inv2 = coin::mint_for_testing<UMB>(SUPPLY, ts::ctx(&mut s));
        umbra_swap::create_pool(inv2, SUPPLY, MIN_PRICE, COMMIT_END, REVEAL_END, ts::ctx(&mut s));

        advance_clock_to(&mut s, COMMIT_END + 1);
        ts::next_tx(&mut s, ALICE);
        let order = ts::take_from_sender<SealedOrder>(&s);
        // take the most-recently-created shared pool (pool B)
        let mut pool_b = ts::take_shared<SwapPool>(&s);
        let clock = ts::take_shared<Clock>(&s);
        umbra_swap::reveal_order(&mut pool_b, &order, 200, 4, make_nonce(1), &clock, ts::ctx(&mut s));
        ts::return_shared(pool_b);
        ts::return_to_sender(&s, order);
        ts::return_shared(clock);
        ts::end(s);
    }

    // ── Settlement guards ───────────────────────────────────────────────────────

    #[test, expected_failure(abort_code = umbra::umbra_swap::ETooEarly)]
    fun test_settle_too_early_fails() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        do_settle(&mut s, 0);  // reveal_end not reached
        ts::end(s);
    }

    #[test, expected_failure(abort_code = umbra::umbra_swap::EAlreadySettled)]
    fun test_double_settle_fails() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        advance_clock_to(&mut s, REVEAL_END + 1);
        do_settle(&mut s, 0);
        do_settle(&mut s, 1);  // must abort EAlreadySettled
        ts::end(s);
    }

    #[test]
    fun test_settle_zero_reveals() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        advance_clock_to(&mut s, REVEAL_END + 1);
        do_settle(&mut s, 0);

        ts::next_tx(&mut s, MAKER);
        let pool = ts::take_shared<SwapPool>(&s);
        assert!(umbra_swap::is_settled(&pool), 0);
        assert!(umbra_swap::clearing_price(&pool) == 0, 1);
        ts::return_shared(pool);
        ts::end(s);
    }

    // ── Clearing math + escrow refunds + UMB delivery ────────────────────────────

    #[test]
    fun test_clearing_two_winners_and_refunds() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);  // supply 10

        // Bob 300×4, Alice 200×4, Carol 150×4  → total 12 > 10
        submit(&mut s, BOB,   make_hash(300, 4, 2), 1200);
        submit(&mut s, ALICE, make_hash(200, 4, 1), 800);
        submit(&mut s, CAROL, make_hash(150, 4, 3), 600);

        advance_clock_to(&mut s, COMMIT_END + 1);
        reveal(&mut s, BOB,   300, 4, make_nonce(2));
        reveal(&mut s, ALICE, 200, 4, make_nonce(1));
        reveal(&mut s, CAROL, 150, 4, make_nonce(3));

        advance_clock_to(&mut s, REVEAL_END + 1);
        do_settle(&mut s, 0);

        // clearing = 150; Bob+Alice fill (8 ≤ 10), Carol marginal can't fit (4 > 2)
        ts::next_tx(&mut s, MAKER);
        let pool = ts::take_shared<SwapPool>(&s);
        assert!(umbra_swap::clearing_price(&pool) == 150, 0);
        assert!(umbra_swap::is_winner(&pool, BOB), 1);
        assert!(umbra_swap::is_winner(&pool, ALICE), 2);
        assert!(!umbra_swap::is_winner(&pool, CAROL), 3);
        ts::return_shared(pool);

        // Bob claims: 4 UMB, pays 150*4=600, refund 1200-600=600, saved (300-150)*4=600
        claim(&mut s, BOB);
        ts::next_tx(&mut s, BOB);
        let umb_bob = ts::take_from_sender<Coin<UMB>>(&s);
        assert!(coin::value(&umb_bob) == 4, 4);
        ts::return_to_sender(&s, umb_bob);
        let refund_bob = ts::take_from_sender<Coin<SUI>>(&s);
        assert!(coin::value(&refund_bob) == 600, 5);
        ts::return_to_sender(&s, refund_bob);
        let nft_bob = ts::take_from_sender<MevShieldNFT>(&s);
        assert!(umbra_swap::nft_total_saved(&nft_bob) == 600, 6);
        assert!(umbra_swap::nft_trades(&nft_bob) == 1, 7);
        ts::return_to_sender(&s, nft_bob);

        // Alice claims: 4 UMB, pays 600, refund 800-600=200, saved (200-150)*4=200
        claim(&mut s, ALICE);
        ts::next_tx(&mut s, ALICE);
        let umb_alice = ts::take_from_sender<Coin<UMB>>(&s);
        assert!(coin::value(&umb_alice) == 4, 8);
        ts::return_to_sender(&s, umb_alice);
        let refund_alice = ts::take_from_sender<Coin<SUI>>(&s);
        assert!(coin::value(&refund_alice) == 200, 9);
        ts::return_to_sender(&s, refund_alice);
        let nft_alice = ts::take_from_sender<MevShieldNFT>(&s);
        assert!(umbra_swap::nft_total_saved(&nft_alice) == 200, 10);
        ts::return_to_sender(&s, nft_alice);

        // Carol (loser) claims: full 600 refund, no UMB, no NFT
        claim(&mut s, CAROL);
        ts::next_tx(&mut s, CAROL);
        assert!(!ts::has_most_recent_for_sender<Coin<UMB>>(&s), 11);
        assert!(!ts::has_most_recent_for_sender<MevShieldNFT>(&s), 12);
        let refund_carol = ts::take_from_sender<Coin<SUI>>(&s);
        assert!(coin::value(&refund_carol) == 600, 13);
        ts::return_to_sender(&s, refund_carol);
        ts::end(s);
    }

    // ── Random margin tie: 3 equal-price orders, supply fits exactly one ─────────

    #[test]
    fun test_random_margin_tie_single_winner() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, 2);  // supply 2 units

        // all price 100, qty 2 → total 6 > 2; clearing 100; remaining 2; one whole order wins
        submit(&mut s, ALICE, make_hash(100, 2, 1), 200);
        submit(&mut s, BOB,   make_hash(100, 2, 2), 200);
        submit(&mut s, CAROL, make_hash(100, 2, 3), 200);

        advance_clock_to(&mut s, COMMIT_END + 1);
        reveal(&mut s, ALICE, 100, 2, make_nonce(1));
        reveal(&mut s, BOB,   100, 2, make_nonce(2));
        reveal(&mut s, CAROL, 100, 2, make_nonce(3));

        advance_clock_to(&mut s, REVEAL_END + 1);
        do_settle(&mut s, 0);

        ts::next_tx(&mut s, MAKER);
        let pool = ts::take_shared<SwapPool>(&s);
        assert!(umbra_swap::clearing_price(&pool) == 100, 0);
        // exactly one of the three is a winner (random pick)
        let mut wins = 0u64;
        if (umbra_swap::is_winner(&pool, ALICE)) wins = wins + 1;
        if (umbra_swap::is_winner(&pool, BOB))   wins = wins + 1;
        if (umbra_swap::is_winner(&pool, CAROL)) wins = wins + 1;
        assert!(wins == 1, 1);
        ts::return_shared(pool);
        ts::end(s);
    }

    // ── NFT evolves across two pools ─────────────────────────────────────────────

    #[test]
    fun test_nft_mint_then_evolve() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);

        // Pool 1: Alice wins outright (only bidder), saved (200-200)*? → use a loser to set clearing
        submit(&mut s, ALICE, make_hash(300, 2, 1), 600);
        submit(&mut s, BOB,   make_hash(200, 2, 2), 400);
        advance_clock_to(&mut s, COMMIT_END + 1);
        reveal(&mut s, ALICE, 300, 2, make_nonce(1));
        reveal(&mut s, BOB,   200, 2, make_nonce(2));
        advance_clock_to(&mut s, REVEAL_END + 1);
        do_settle(&mut s, 0);
        // total 4 ≤ supply 10 → all fill, clearing = lowest = 200.
        // Alice saved (300-200)*2 = 200.
        claim(&mut s, ALICE);

        ts::next_tx(&mut s, ALICE);
        let nft1 = ts::take_from_sender<MevShieldNFT>(&s);
        assert!(umbra_swap::nft_trades(&nft1) == 1, 0);
        assert!(umbra_swap::nft_total_saved(&nft1) == 200, 1);

        // Pool 2 (fresh): Alice wins again, passes the existing NFT to evolve it.
        ts::next_tx(&mut s, MAKER);
        let inv2 = coin::mint_for_testing<UMB>(SUPPLY, ts::ctx(&mut s));
        umbra_swap::create_pool(inv2, SUPPLY, MIN_PRICE, COMMIT_END + 10_000, REVEAL_END + 10_000, ts::ctx(&mut s));

        // submit into pool 2 (clock currently REVEAL_END+1 < COMMIT_END+10_000 → COMMIT open)
        ts::next_tx(&mut s, ALICE);
        let mut pool2 = ts::take_shared<SwapPool>(&s);
        let clock = ts::take_shared<Clock>(&s);
        let esc = coin::mint_for_testing<SUI>(600, ts::ctx(&mut s));
        umbra_swap::submit_order(&mut pool2, make_hash(300, 2, 5), esc, option::none(), &clock, ts::ctx(&mut s));
        ts::return_shared(pool2);
        ts::return_shared(clock);

        ts::next_tx(&mut s, BOB);
        let mut pool2 = ts::take_shared<SwapPool>(&s);
        let clock = ts::take_shared<Clock>(&s);
        let esc = coin::mint_for_testing<SUI>(400, ts::ctx(&mut s));
        umbra_swap::submit_order(&mut pool2, make_hash(200, 2, 6), esc, option::none(), &clock, ts::ctx(&mut s));
        ts::return_shared(pool2);
        ts::return_shared(clock);

        advance_clock_to(&mut s, COMMIT_END + 10_001);
        ts::next_tx(&mut s, ALICE);
        let mut pool2 = ts::take_shared<SwapPool>(&s);
        let order = ts::take_from_sender<SealedOrder>(&s);
        let clock = ts::take_shared<Clock>(&s);
        umbra_swap::reveal_order(&mut pool2, &order, 300, 2, make_nonce(5), &clock, ts::ctx(&mut s));
        ts::return_shared(pool2);
        ts::return_to_sender(&s, order);
        ts::return_shared(clock);

        ts::next_tx(&mut s, BOB);
        let mut pool2 = ts::take_shared<SwapPool>(&s);
        let order = ts::take_from_sender<SealedOrder>(&s);
        let clock = ts::take_shared<Clock>(&s);
        umbra_swap::reveal_order(&mut pool2, &order, 200, 2, make_nonce(6), &clock, ts::ctx(&mut s));
        ts::return_shared(pool2);
        ts::return_to_sender(&s, order);
        ts::return_shared(clock);

        advance_clock_to(&mut s, REVEAL_END + 10_001);
        // settle pool2
        ts::next_tx(&mut s, @0x0);
        let mut rand = ts::take_shared<Random>(&s);
        random::update_randomness_state_for_testing(
            &mut rand, 1,
            x"2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F2F",
            ts::ctx(&mut s),
        );
        ts::return_shared(rand);
        ts::next_tx(&mut s, MAKER);
        let mut pool2 = ts::take_shared<SwapPool>(&s);
        let rand = ts::take_shared<Random>(&s);
        let clock = ts::take_shared<Clock>(&s);
        umbra_swap::settle(&mut pool2, &rand, &clock, ts::ctx(&mut s));
        ts::return_shared(pool2);
        ts::return_shared(rand);
        ts::return_shared(clock);

        // Alice claims pool2 passing nft1 → evolves to trades=2, total_saved=200+200=400
        ts::next_tx(&mut s, ALICE);
        let mut pool2 = ts::take_shared<SwapPool>(&s);
        let order = ts::take_from_sender<SealedOrder>(&s);
        umbra_swap::claim_fill(&mut pool2, order, option::some(nft1), IMG, ts::ctx(&mut s));
        ts::return_shared(pool2);

        ts::next_tx(&mut s, ALICE);
        let nft2 = ts::take_from_sender<MevShieldNFT>(&s);
        assert!(umbra_swap::nft_trades(&nft2) == 2, 2);
        assert!(umbra_swap::nft_total_saved(&nft2) == 400, 3);
        ts::return_to_sender(&s, nft2);
        ts::end(s);
    }

    // ── Authorization ────────────────────────────────────────────────────────────

    #[test, expected_failure(abort_code = umbra::umbra_swap::EUnauthorized)]
    fun test_claim_wrong_sender_fails() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);
        submit(&mut s, ALICE, make_hash(200, 4, 1), 800);
        advance_clock_to(&mut s, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, 4, make_nonce(1));
        advance_clock_to(&mut s, REVEAL_END + 1);
        do_settle(&mut s, 0);

        // Alice transfers her order to Bob; Bob tries to claim (order.taker=ALICE).
        ts::next_tx(&mut s, ALICE);
        let order = ts::take_from_sender<SealedOrder>(&s);
        transfer::public_transfer(order, BOB);

        ts::next_tx(&mut s, BOB);
        let mut pool = ts::take_shared<SwapPool>(&s);
        let order = ts::take_from_sender<SealedOrder>(&s);
        umbra_swap::claim_fill(&mut pool, order, option::none(), IMG, ts::ctx(&mut s));
        ts::return_shared(pool);
        ts::end(s);
    }

    // ── Maker withdraw ───────────────────────────────────────────────────────────

    #[test]
    fun test_maker_withdraw_proceeds_and_leftover() {
        let mut s = ts::begin(MAKER);
        setup(&mut s, SUPPLY);  // 10 UMB inventory

        // single winner Alice 200×4 → fills 4, clearing 200, proceeds 800, leftover 6 UMB
        submit(&mut s, ALICE, make_hash(200, 4, 1), 800);
        advance_clock_to(&mut s, COMMIT_END + 1);
        reveal(&mut s, ALICE, 200, 4, make_nonce(1));
        advance_clock_to(&mut s, REVEAL_END + 1);
        do_settle(&mut s, 0);
        claim(&mut s, ALICE);

        ts::next_tx(&mut s, MAKER);
        let mut pool = ts::take_shared<SwapPool>(&s);
        let cap = ts::take_from_sender<MakerCap>(&s);
        umbra_swap::withdraw_proceeds(&mut pool, &cap, ts::ctx(&mut s));
        ts::return_shared(pool);
        ts::return_to_sender(&s, cap);

        // Maker now holds 800 SUI proceeds + 6 UMB leftover
        ts::next_tx(&mut s, MAKER);
        let proceeds = ts::take_from_sender<Coin<SUI>>(&s);
        assert!(coin::value(&proceeds) == 800, 0);
        ts::return_to_sender(&s, proceeds);
        let leftover = ts::take_from_sender<Coin<UMB>>(&s);
        assert!(coin::value(&leftover) == 6, 1);
        ts::return_to_sender(&s, leftover);
        ts::end(s);
    }
}
