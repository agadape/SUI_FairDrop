export const NETWORK = "testnet" as const;
export const FULLNODE_URL = "https://fullnode.testnet.sui.io:443";

// Set after deploying contracts
export const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ?? "";
export const AUCTION_ID = process.env.NEXT_PUBLIC_AUCTION_ID ?? "";

export const CLOCK_ID = "0x6";
export const RANDOM_ID = "0x8";

export const MIST_PER_SUI = BigInt(1_000_000_000);
