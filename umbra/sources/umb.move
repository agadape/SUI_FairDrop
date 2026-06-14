/// UMB — the demo asset swapped on Umbra. A plain Sui coin so the swap moves a
/// real second asset (SUI in → UMB out) instead of an abstract allocation.
module umbra::umb {
    use sui::coin::{Self, TreasuryCap};

    /// One-time witness — must match the module name uppercased.
    public struct UMB has drop {}

    fun init(witness: UMB, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            9,
            b"UMB",
            b"Umbra Demo Token",
            b"Demo asset swapped confidentially on Umbra",
            option::none(),
            ctx,
        );
        transfer::public_freeze_object(metadata);
        // Treasury goes to the publisher so a maker can mint demo inventory.
        transfer::public_transfer(treasury, ctx.sender());
    }

    /// Mint demo inventory straight to the caller (CLI-friendly: no return value).
    public fun mint(treasury: &mut TreasuryCap<UMB>, amount: u64, ctx: &mut TxContext) {
        transfer::public_transfer(coin::mint(treasury, amount, ctx), ctx.sender());
    }
}
