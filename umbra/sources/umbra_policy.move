/// Seal access policy for Umbra order-nonce recovery.
///
/// Mirrors fairdrop::seal_policy: a Seal key server runs `seal_approve` as a
/// dry-run before releasing the decryption key. The policy: the caller must own
/// a SealedOrder for the target pool AND the reveal window must still be open
/// (no reason to decrypt a nonce once the order can no longer be revealed).
///
/// The function name `seal_approve` and the leading `id` parameter are Seal SDK
/// conventions — do not rename.
module umbra::umbra_policy {
    use sui::clock::{Self, Clock};
    use umbra::umbra_swap::{Self, SwapPool, SealedOrder};

    public fun seal_approve(
        id: vector<u8>,
        order: &SealedOrder,
        pool: &SwapPool,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        // id encodes the pool object ID bytes — bind ciphertext to this pool
        let pool_id_bytes = object::id_to_bytes(&object::id(pool));
        assert!(id == pool_id_bytes, 0);
        assert!(umbra_swap::order_pool_id(order) == object::id(pool), 1);

        // Allow decryption only while the reveal phase is open
        assert!(clock::timestamp_ms(clock) < umbra_swap::reveal_end_ms(pool), 2);
    }
}
