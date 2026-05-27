/// Seal access policy for FairDrop nonce encryption.
///
/// Seal threshold decryption requires the requester to satisfy this policy
/// on-chain. The policy: the caller must own an Entry for the target auction
/// AND the current time must be before reveal_end_ms (no point decrypting
/// after the auction is over and the nonce no longer matters).
///
/// Seal SDK calls `seal_approve` as a dry-run to determine access. The
/// function name "seal_approve" and the `id` parameter are the Seal SDK
/// convention — do not rename.
module fairdrop::seal_policy {
    use sui::clock::{Self, Clock};
    use fairdrop::auction::{Self, Auction, Entry};

    /// Approve nonce decryption for a bidder.
    /// `id` = the Seal-encrypted blob's policy ID (must match auction_id bytes).
    /// Caller must present their Entry and a valid Clock.
    /// Aborts if: Entry doesn't belong to this auction, or reveal phase ended.
    public fun seal_approve(
        id: vector<u8>,
        entry: &Entry,
        auction: &Auction,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        // id encodes the auction object ID bytes — verify entry is for same auction
        let auction_id_bytes = object::id_to_bytes(&object::id(auction));
        assert!(id == auction_id_bytes, 0);
        assert!(auction::entry_auction_id(entry) == object::id(auction), 1);

        // Allow decryption only while reveal phase is open (bidder needs nonce to reveal)
        assert!(clock::timestamp_ms(clock) < auction::reveal_end_ms(auction), 2);
    }
}
