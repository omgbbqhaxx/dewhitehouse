import { parseAbi } from "viem";

// VRNouns koleksiyonundan kullanilan minimal yuzey.
export const NFT_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function getNFTzBelongingToOwner(address owner) view returns (uint256[])",
]);
