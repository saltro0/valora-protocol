export const WHBAR_ADDRESS = "0x0000000000000000000000000000000000003ad2";
// WHBAR wrapper contract (treasury) — call deposit() here, not on the HTS token
export const WHBAR_WRAPPER_ADDRESS = "0x0000000000000000000000000000000000003ad1";

export const TOKEN_MAP: Record<string, { symbol: string; name: string; decimals: number; logo?: string }> = {
  [WHBAR_ADDRESS]: { symbol: "HBAR", name: "HBAR", decimals: 8, logo: "/hbar.png" },
  "0x0000000000000000000000000000000000001549": { symbol: "USDC", name: "USD Coin", decimals: 6 },
  "0x0000000000000000000000000000000000120f46": { symbol: "SAUCE", name: "SaucerSwap", decimals: 6, logo: "/sauce.png" },
};
