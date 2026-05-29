"use client";

import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { createNetworkConfig } from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useState } from "react";
import { registerEnokiWallets } from "@mysten/enoki";

const ENOKI_API_KEY = process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? "";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

const { networkConfig } = createNetworkConfig({
  testnet: { url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" as const },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Register Enoki Google wallet with the wallet standard registry
  // WalletProvider reads registered wallets automatically
  useEffect(() => {
    if (!ENOKI_API_KEY || !GOOGLE_CLIENT_ID) return;
    const { unregister } = registerEnokiWallets({
      apiKey: ENOKI_API_KEY,
      providers: {
        google: {
          clientId: GOOGLE_CLIENT_ID,
          redirectUrl: window.location.origin,
        },
      },
      network: "testnet",
      // Enoki requires a real ClientWithCoreApi (has `.core`); a bare {url} object
      // left client.core undefined → executor crashed on client.core.getCurrentSystemState().
      client: new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" }),
    });
    return unregister;
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
