import { isAddressLike } from "@/lib/utils";

export type ArcMode = "mock" | "onchain";

export const defaultContractAddresses = {
  erc8004Registry: "0xd8499627775ac67cd756335a3c48387d0aff5553",
  erc8183Escrow: "0x08eb8630f6b5d2c1c030688076b80360531a2e9a",
  erc8183EscrowV2: "0x6255f3fbb7b4f82062b929029dc005baf0ca3ebb",
  usdc: "native"
} as const;

const rawContractAddresses = {
  erc8004Registry: process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS ?? defaultContractAddresses.erc8004Registry,
  erc8183Escrow: process.env.NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS ?? defaultContractAddresses.erc8183Escrow,
  erc8183EscrowV2:
    process.env.NEXT_PUBLIC_ERC8183_ESCROW_V2_ADDRESS ?? defaultContractAddresses.erc8183EscrowV2,
  usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS ?? defaultContractAddresses.usdc
};

export const contractAddresses = rawContractAddresses;
export const escrowV2InitialJobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V2_INITIAL_JOB_ID ?? "1000000");

export function getArcMode(): ArcMode {
  return process.env.NEXT_PUBLIC_ARC_MODE === "mock" ? "mock" : "onchain";
}

export function getOnchainReadiness() {
  const requiredAddresses = Object.entries(rawContractAddresses).filter(([key]) => key !== "erc8183EscrowV2");
  const missing = requiredAddresses
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
