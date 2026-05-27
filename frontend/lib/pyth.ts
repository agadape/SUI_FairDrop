"use client";

import { useEffect, useState } from "react";

// SUI/USD price feed ID on Pyth
const SUI_USD_FEED_ID = "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744";
const HERMES = "https://hermes.pyth.network";

type HermesPrice = { price: { price: string; expo: number } };

export async function fetchSuiUsdPrice(): Promise<number | null> {
  try {
    const url = `${HERMES}/v2/updates/price/latest?ids[]=${SUI_USD_FEED_ID}&parsed=true`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json() as { parsed?: HermesPrice[] };
    const p = json.parsed?.[0]?.price;
    if (!p) return null;
    return Number(p.price) * Math.pow(10, p.expo);
  } catch {
    return null;
  }
}

export function useSuiUsdPrice(): number | null {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    fetchSuiUsdPrice().then(setPrice);
    const id = setInterval(() => fetchSuiUsdPrice().then(setPrice), 30_000);
    return () => clearInterval(id);
  }, []);
  return price;
}
