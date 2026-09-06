import type { Address } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

// VRNouns koleksiyonu (Base). flooor.fun ile ayni giris kapisi.
export const COLLECTION_ADDR: Address =
  "0xbB56a9359DF63014B3347585565d6F80Ac6305fd";

// Deploy sonrasi .env.local icinde NEXT_PUBLIC_CONTRACT_ADDR olarak verilir.
export const CONTRACT_ADDR: Address =
  (process.env.NEXT_PUBLIC_CONTRACT_ADDR as Address | undefined) ?? ZERO;

export const IS_DEPLOYED = CONTRACT_ADDR.toLowerCase() !== ZERO;

export const SITE_NAME = "De White House";
export const SITE_URL = "https://dewhitehouse.fun";
