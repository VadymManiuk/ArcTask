import { isAddressLike } from "@/lib/utils";

export type ArcMode = "mock" | "onchain";

export const defaultContractAddresses = {
  erc8004Registry: "0xe69e88cb35a831fca783ac56405831478fdbaa41",
  erc8183Escrow: "0x2b3e0b7a7d96f8199fe31b2867358990430b5181",
  usdc: "native"
} as const;

const rawContractAddresses = {
  erc8004Registry: process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS ?? defaultContractAddresses.erc8004Registry,
  erc8183Escrow: process.env.NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS ?? defaultContractAddresses.erc8183Escrow,
  usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS ?? defaultContractAddresses.usdc
};

export const contractAddresses = rawContractAddresses;

export function getArcMode(): ArcMode {
  return process.env.NEXT_PUBLIC_ARC_MODE === "mock" ? "mock" : "onchain";
}

export function getOnchainReadiness() {
  const missing = Object.entries(rawContractAddresses)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  const invalid = Object.entries(rawContractAddresses)
    .filter(([key, value]) => value && !(key === "usdc" && value === "native") && !isAddressLike(value))
    .map(([key]) => key);

  return {
    mode: getArcMode(),
    isReady: missing.length === 0 && invalid.length === 0,
    missing,
    invalid
  };
}
