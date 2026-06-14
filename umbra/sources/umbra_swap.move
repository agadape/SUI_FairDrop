/// Umbra — confidential, MEV-proof sealed batch swap.
///
/// A maker lists `Coin<UMB>` inventory; takers submit BLIND orders
/// (`sha3_256(price ‖ qty ‖ nonce)`) escrowing SUI; after the reveal window the
/// batch clears at one uniform price, the marginal slots assigned by
/// `sui::random`, with a single partial fill so supply is fully utilized.
/// Nothing is observable during commit → nothing to sandwich. Each winning fill
/// mints/evolves a `MevShieldNFT` recording the on-chain price-improvement.
#[allow(lint(self_transfer))]
module umbra::umbra_swap {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::sui::SUI;
    use sui::random::{Self, Random};
    use sui::table::{Self, Table};
    use sui::vec_map::{Self, VecMap};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::display;
    use sui::package;
    use std::string::{Self, String};
    use umbra::umb::UMB;

    // ── Error codes ──────────────────────────────────────────────────────────
    const EPhaseEnded:         u64 = 1;
    const ETooEarly:           u64 = 2;
    const EHashMismatch:       u64 = 3;
    const EInsufficientEscrow: u64 = 4;
    const EAlreadySettled:     u64 = 5;
    const ENotSettled:         u64 = 6;
    const EWrongPool:          u64 = 7;
    const EUnauthorized:       u64 = 8;
    const EAlreadyOrdered:     u64 = 9;
    const EBelowMinPrice:      u64 = 10;
    const EBelowMinEscrow:     u64 = 11;   // submit escrow < min_bid (anti-spam)
    const ETooManyOrders:      u64 = 12;   // reveals at MAX_ORDERS (anti-OOG)
    const EQtyOutOfRange:      u64 = 13;   // qty == 0 or > MAX_QTY
    const EPriceTooHigh:       u64 = 14;   // price > MAX_PRICE (overflow guard)
    const EBadParams:          u64 = 15;   // create_pool sanity
    const ENotEligible:        u64 = 16;   // reclaim_unsettled preconditions

    // ── Hard bounds ──────────────────────────────────────────────────────────
    // MAX_PRICE * MAX_QTY = 1e12 * 1e6 = 1e18 < u64::MAX (~1.8e19) — price*qty
    // and clearing*qty can never overflow.
    const MAX_ORDERS: u64 = 256;                  // bounds settle's O(n^2) work
    const MAX_PRICE:  u64 = 1_000_000_000_000;    // 1,000 SUI per unit (in MIST)
    const MAX_QTY:    u64 = 1_000_000;            // 1e6 units
    const RECLAIM_GRACE_MS: u64 = 3_600_000;      // 1h after reveal_end before unsettled reclaim

    // ── One-time witness for the Display Publisher ───────────────────────────
    public struct UMBRA_SWAP has drop {}

    // ── A revealed order (price per UMB unit, in MIST; qty in UMB units) ──────
    public struct Order has copy, drop, store { price: u64, qty: u64 }

    // ── Shared batch ─────────────────────────────────────────────────────────
    public struct SwapPool has key {
        id: UID,
        maker: address,
        inventory: Balance<UMB>,
        supply_units: u64,
        min_price: u64,                             // per-unit floor (reveal)
        min_bid: u64,                               // min escrow per order (submit; anti-spam)
        commit_end_ms: u64,
        reveal_end_ms: u64,
        commitments: Table<address, vector<u8>>,    // sender → hash (dedup + blind)
        reveals: VecMap<address, Order>,            // populated in reveal phase
        winners: Table<address, u64>,               // winner → FILLED qty (set by settle)
        clearing_price: u64,
        unsold: u64,                                // UMB not reserved for winners (set by settle)
        proceeds: Balance<SUI>,
        settled: bool,
    }

    public struct MakerCap has key, store { id: UID, pool_id: ID }

    // ── Owned blind order ────────────────────────────────────────────────────
    public struct SealedOrder has key, store {
        id: UID,
        pool_id: ID,
        taker: address,
        commitment_hash: vector<u8>,
        escrow: Balance<SUI>,
        blob_id: Option<vector<u8>>,
    }

    // ── Dynamic "MEV Saved" receipt (evolves per trade) ──────────────────────
    public struct MevShieldNFT has key, store {
        id: UID,
        owner: address,
        trades: u64,
        total_saved: u64,
        last_saved: u64,
        image_url: String,
    }

    // ── Events ───────────────────────────────────────────────────────────────
    public struct PoolCreated    has copy, drop { pool_id: ID, maker: address, supply_units: u64 }
    public struct OrderSubmitted has copy, drop { pool_id: ID, taker: address }
    public struct OrderRevealed  has copy, drop { pool_id: ID, taker: address, price: u64, qty: u64 }
    public struct PoolSettled    has copy, drop { pool_id: ID, clearing_price: u64, winner_count: u64, filled: u64 }
    public struct MevShielded    has copy, drop { taker: address, saved: u64, total_saved: u64 }

    // ── Display setup ────────────────────────────────────────────────────────
    fun init(otw: UMBRA_SWAP, ctx: &mut TxContext) {
        let publisher = package::claim(otw, ctx);
        let mut disp = display::new<MevShieldNFT>(&publisher, ctx);
        display::add(&mut disp, string::utf8(b"name"), string::utf8(b"Umbra MEV Shield"));
        display::add(
            &mut disp,
            string::utf8(b"description"),
            string::utf8(b"Shielded {total_saved} MIST of MEV across {trades} confidential trades on Umbra."),
        );
        display::add(&mut disp, string::utf8(b"image_url"), string::utf8(b"{image_url}"));
        display::update_version(&mut disp);
        transfer::public_transfer(publisher, ctx.sender());
        transfer::public_transfer(disp, ctx.sender());
    }

    // ── Maker lists inventory ────────────────────────────────────────────────
    public fun create_pool(
        inventory: Coin<UMB>,
        supply_units: u64,
        min_price: u64,
        min_bid: u64,
        commit_end_ms: u64,
        reveal_end_ms: u64,
        ctx: &mut TxContext,
    ) {
        assert!(reveal_end_ms > commit_end_ms, EBadParams);
        assert!(supply_units > 0, EBadParams);
        assert!(min_price > 0 && min_price <= MAX_PRICE, EBadParams);
        assert!(min_bid > 0, EBadParams);
        // Inventory must cover a full clear, else winners couldn't be delivered.
        assert!(coin::value(&inventory) >= supply_units, EBadParams);

        let uid = object::new(ctx);
        let pool_id = object::uid_to_inner(&uid);
        let pool = SwapPool {
            id: uid,
            maker: ctx.sender(),
            inventory: coin::into_balance(inventory),
            supply_units,
            min_price,
            min_bid,
            commit_end_ms,
            reveal_end_ms,
            commitments: table::new(ctx),
            reveals: vec_map::empty(),
            winners: table::new(ctx),
            clearing_price: 0,
            unsold: 0,
            proceeds: balance::zero(),
            settled: false,
        };
        let cap = MakerCap { id: object::new(ctx), pool_id };
        event::emit(PoolCreated { pool_id, maker: ctx.sender(), supply_units });
        transfer::share_object(pool);
        transfer::transfer(cap, ctx.sender());
    }

    // ── Taker submits a blind order ──────────────────────────────────────────
    public fun submit_order(
        pool: &mut SwapPool,
        commitment_hash: vector<u8>,
        escrow: Coin<SUI>,
        blob_id: Option<vector<u8>>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(clock::timestamp_ms(clock) < pool.commit_end_ms, EPhaseEnded);
        assert!(coin::value(&escrow) >= pool.min_bid, EBelowMinEscrow); // anti-spam floor
        assert!(!table::contains(&pool.commitments, ctx.sender()), EAlreadyOrdered);
        table::add(&mut pool.commitments, ctx.sender(), commitment_hash);
        let order = SealedOrder {
            id: object::new(ctx),
            pool_id: object::id(pool),
            taker: ctx.sender(),
            commitment_hash,
            escrow: coin::into_balance(escrow),
            blob_id,
        };
        event::emit(OrderSubmitted { pool_id: object::id(pool), taker: ctx.sender() });
        transfer::transfer(order, ctx.sender());
    }

    // ── Taker reveals ────────────────────────────────────────────────────────
    public fun reveal_order(
        pool: &mut SwapPool,
        order: &SealedOrder,
        price: u64,
        qty: u64,
        nonce: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(order.pool_id == object::id(pool), EWrongPool);
        assert!(order.taker == ctx.sender(), EUnauthorized);
        let now = clock::timestamp_ms(clock);
        assert!(now >= pool.commit_end_ms, ETooEarly);
        assert!(now < pool.reveal_end_ms, EPhaseEnded);
        // Bounds — make price*qty overflow-impossible and cap the batch size.
        assert!(qty > 0 && qty <= MAX_QTY, EQtyOutOfRange);
        assert!(price >= pool.min_price, EBelowMinPrice);
        assert!(price <= MAX_PRICE, EPriceTooHigh);
        assert!(vec_map::length(&pool.reveals) < MAX_ORDERS, ETooManyOrders);
        assert!(balance::value(&order.escrow) >= price * qty, EInsufficientEscrow);

        let mut preimage = std::bcs::to_bytes(&price);
        std::vector::append(&mut preimage, std::bcs::to_bytes(&qty));
        std::vector::append(&mut preimage, nonce);
        let expected = std::hash::sha3_256(preimage);
        assert!(expected == order.commitment_hash, EHashMismatch);

        vec_map::insert(&mut pool.reveals, ctx.sender(), Order { price, qty });
        event::emit(OrderRevealed { pool_id: object::id(pool), taker: ctx.sender(), price, qty });
    }

    // ── Settle the batch — uniform price, random margin, single partial fill ──
    #[allow(lint(public_random))]
    public fun settle(pool: &mut SwapPool, rand: &Random, clock: &Clock, ctx: &mut TxContext) {
        assert!(!pool.settled, EAlreadySettled);
        assert!(clock::timestamp_ms(clock) >= pool.reveal_end_ms, ETooEarly);
        pool.settled = true;

        let n = vec_map::length(&pool.reveals);
        let inv0 = balance::value(&pool.inventory);
        if (n == 0) {
            pool.unsold = inv0;
            event::emit(PoolSettled { pool_id: object::id(pool), clearing_price: 0, winner_count: 0, filled: 0 });
            return
        };

        // Collect into parallel vectors
        let mut addrs: vector<address> = vector[];
        let mut prices: vector<u64> = vector[];
        let mut qtys: vector<u64> = vector[];
        let mut i = 0;
        while (i < n) {
            let (a, o) = vec_map::get_entry_by_idx(&pool.reveals, i);
            vector::push_back(&mut addrs, *a);
            vector::push_back(&mut prices, o.price);
            vector::push_back(&mut qtys, o.qty);
            i = i + 1;
        };

        // Insertion sort descending by price (bounded by MAX_ORDERS)
        let len = vector::length(&prices);
        let mut j = 1;
        while (j < len) {
            let mut k = j;
            while (k > 0) {
                if (*vector::borrow(&prices, k) > *vector::borrow(&prices, k - 1)) {
                    vector::swap(&mut prices, k, k - 1);
                    vector::swap(&mut addrs, k, k - 1);
                    vector::swap(&mut qtys, k, k - 1);
                    k = k - 1;
                } else break
            };
            j = j + 1;
        };

        let mut total_qty = 0;
        let mut t = 0;
        while (t < len) { total_qty = total_qty + *vector::borrow(&qtys, t); t = t + 1; };
        let supply = pool.supply_units;

        let clearing_price = if (total_qty <= supply) {
            *vector::borrow(&prices, len - 1)               // all fill; lowest price clears
        } else {
            let mut cum = 0;
            let mut idx = 0;
            loop {
                cum = cum + *vector::borrow(&qtys, idx);
                if (cum >= supply) break;
                idx = idx + 1;
            };
            *vector::borrow(&prices, idx)
        };
        pool.clearing_price = clearing_price;

        // Winners strictly above clearing fill fully
        let mut filled = 0;
        let mut winner_count = 0;
        let mut w = 0;
        while (w < len) {
            if (*vector::borrow(&prices, w) > clearing_price) {
                table::add(&mut pool.winners, *vector::borrow(&addrs, w), *vector::borrow(&qtys, w));
                filled = filled + *vector::borrow(&qtys, w);
                winner_count = winner_count + 1;
            };
            w = w + 1;
        };

        // Marginal orders (== clearing) shuffled, filled whole until the LAST one
        // takes a partial of whatever remains. Supply is fully utilized.
        let remaining = if (supply > filled) { supply - filled } else { 0 };
        let mut m_addr: vector<address> = vector[];
        let mut m_qty: vector<u64> = vector[];
        let mut m = 0;
        while (m < len) {
            if (*vector::borrow(&prices, m) == clearing_price) {
                vector::push_back(&mut m_addr, *vector::borrow(&addrs, m));
                vector::push_back(&mut m_qty, *vector::borrow(&qtys, m));
            };
            m = m + 1;
        };
        let mut rng = random::new_generator(rand, ctx);
        let mut s = vector::length(&m_addr);
        while (s > 1) {
            let pick = random::generate_u64_in_range(&mut rng, 0, s - 1);
            vector::swap(&mut m_addr, s - 1, pick);
            vector::swap(&mut m_qty, s - 1, pick);
            s = s - 1;
        };
        let mut rem = remaining;
        let mut p = 0;
        let mlen = vector::length(&m_addr);
        while (p < mlen && rem > 0) {
            let q = *vector::borrow(&m_qty, p);
            let fill = if (q <= rem) { q } else { rem };   // single partial at the tail
            table::add(&mut pool.winners, *vector::borrow(&m_addr, p), fill);
            rem = rem - fill;
            filled = filled + fill;
            winner_count = winner_count + 1;
            p = p + 1;
        };

        // Reserve filled inventory for winners; the rest is the maker's to withdraw.
        pool.unsold = if (inv0 > filled) { inv0 - filled } else { 0 };

        event::emit(PoolSettled { pool_id: object::id(pool), clearing_price, winner_count, filled });
    }

    // ── Taker claims fill (or full refund) + evolves the MEV-Saved NFT ───────
    public fun claim_fill(
        pool: &mut SwapPool,
        order: SealedOrder,
        mut maybe_nft: Option<MevShieldNFT>,
        image_url: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(pool.settled, ENotSettled);
        assert!(order.pool_id == object::id(pool), EWrongPool);
        assert!(order.taker == ctx.sender(), EUnauthorized);
        let sender = ctx.sender();

        let SealedOrder { id, pool_id: _, taker: _, commitment_hash: _, escrow, blob_id: _ } = order;
        object::delete(id);
        let mut esc_coin = coin::from_balance(escrow, ctx);

        if (table::contains(&pool.winners, sender)) {
            let fill = *table::borrow(&pool.winners, sender);    // FILLED qty (may be partial)
            let clearing = pool.clearing_price;
            let cost = clearing * fill;

            let payment = coin::split(&mut esc_coin, cost, ctx);
            balance::join(&mut pool.proceeds, coin::into_balance(payment));
            let umb_out = balance::split(&mut pool.inventory, fill);
            transfer::public_transfer(coin::from_balance(umb_out, ctx), sender);
            if (coin::value(&esc_coin) > 0) {
                transfer::public_transfer(esc_coin, sender);
            } else {
                coin::destroy_zero(esc_coin);
            };

            let my_price = vec_map::get(&pool.reveals, &sender).price;
            let saved = (my_price - clearing) * fill;

            let nft = if (option::is_some(&maybe_nft)) {
                let mut nn = option::extract(&mut maybe_nft);
                nn.trades = nn.trades + 1;
                nn.total_saved = nn.total_saved + saved;
                nn.last_saved = saved;
                nn
            } else {
                MevShieldNFT {
                    id: object::new(ctx),
                    owner: sender,
                    trades: 1,
                    total_saved: saved,
                    last_saved: saved,
                    image_url: string::utf8(image_url),
                }
            };
            event::emit(MevShielded { taker: sender, saved, total_saved: nft.total_saved });
            transfer::public_transfer(nft, sender);
        } else {
            transfer::public_transfer(esc_coin, sender);
            if (option::is_some(&maybe_nft)) {
                transfer::public_transfer(option::extract(&mut maybe_nft), sender);
            };
        };
        option::destroy_none(maybe_nft);
    }

    // ── Escape hatch: never let escrow be stranded ───────────────────────────
    // If the batch is past reveal_end + grace and was never settled (e.g. settle
    // could not run), any taker can pull their own escrow back.
    public fun reclaim_unsettled(
        pool: &mut SwapPool,
        order: SealedOrder,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(order.pool_id == object::id(pool), EWrongPool);
        assert!(order.taker == ctx.sender(), EUnauthorized);
        assert!(!pool.settled, ENotEligible);                                  // settled → use claim_fill
        assert!(clock::timestamp_ms(clock) >= pool.reveal_end_ms + RECLAIM_GRACE_MS, ETooEarly);

        let SealedOrder { id, pool_id: _, taker: _, commitment_hash: _, escrow, blob_id: _ } = order;
        object::delete(id);
        transfer::public_transfer(coin::from_balance(escrow, ctx), ctx.sender());
    }

    // ── Maker withdraws SUI proceeds (repeatable) + unsold UMB (once) ─────────
    public fun withdraw_proceeds(pool: &mut SwapPool, cap: &MakerCap, ctx: &mut TxContext) {
        assert!(cap.pool_id == object::id(pool), EUnauthorized);
        assert!(pool.settled, ENotSettled);

        let amt = balance::value(&pool.proceeds);
        if (amt > 0) {
            transfer::public_transfer(coin::from_balance(balance::split(&mut pool.proceeds, amt), ctx), pool.maker);
        };
        // Only the UNSOLD inventory — never the UMB reserved for winners' claims.
        if (pool.unsold > 0) {
            let take = pool.unsold;
            pool.unsold = 0;
            transfer::public_transfer(coin::from_balance(balance::split(&mut pool.inventory, take), ctx), pool.maker);
        };
    }

    // ── View helpers (also used by umbra_policy::seal_approve) ────────────────
    public fun order_pool_id(o: &SealedOrder): ID { o.pool_id }
    public fun order_blob_id(o: &SealedOrder): &Option<vector<u8>> { &o.blob_id }
    public fun reveal_end_ms(p: &SwapPool): u64 { p.reveal_end_ms }
    public fun commit_end_ms(p: &SwapPool): u64 { p.commit_end_ms }
    public fun supply_units(p: &SwapPool): u64 { p.supply_units }
    public fun min_price(p: &SwapPool): u64 { p.min_price }
    public fun min_bid(p: &SwapPool): u64 { p.min_bid }
    public fun clearing_price(p: &SwapPool): u64 { p.clearing_price }
    public fun unsold(p: &SwapPool): u64 { p.unsold }
    public fun is_settled(p: &SwapPool): bool { p.settled }
    public fun reveal_count(p: &SwapPool): u64 { vec_map::length(&p.reveals) }
    public fun is_winner(p: &SwapPool, addr: address): bool { table::contains(&p.winners, addr) }
    public fun winner_fill(p: &SwapPool, addr: address): u64 { *table::borrow(&p.winners, addr) }
    public fun nft_trades(n: &MevShieldNFT): u64 { n.trades }
    public fun nft_total_saved(n: &MevShieldNFT): u64 { n.total_saved }
}
