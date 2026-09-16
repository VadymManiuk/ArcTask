import { defaultContractAddresses, getDeploymentScope, isMainnetContractAddress } from "@/lib/arc-network.mjs";
export { defaultContractAddresses } from "@/lib/arc-network.mjs";

export type ArcMode = "mock" | "onchain";


const rawContractAddresses = {
  erc8004Registry: process.env.NEXT_PUBLIC_ERC8004_REGISTRY_ADDRESS ?? defaultContractAddresses.erc8004Registry,
  erc8183Escrow: process.env.NEXT_PUBLIC_ERC8183_ESCROW_ADDRESS ?? defaultContractAddresses.erc8183Escrow,
  erc8183EscrowV2:
    process.env.NEXT_PUBLIC_ERC8183_ESCROW_V2_ADDRESS ?? defaultContractAddresses.erc8183EscrowV2,
  erc8183EscrowV3:
    process.env.NEXT_PUBLIC_ERC8183_ESCROW_V3_ADDRESS ?? defaultContractAddresses.erc8183EscrowV3,
  erc8183EscrowV4:
    process.env.NEXT_PUBLIC_ERC8183_ESCROW_V4_ADDRESS ?? defaultContractAddresses.erc8183EscrowV4,
  usdc: process.env.NEXT_PUBLIC_USDC_ADDRESS ?? defaultContractAddresses.usdc
};

export const contractAddresses = rawContractAddresses;
export const escrowV2InitialJobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V2_INITIAL_JOB_ID ?? "1000000");
export const escrowV3InitialJobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V3_INITIAL_JOB_ID ?? "2000000");
export const escrowV4InitialJobId = BigInt(process.env.NEXT_PUBLIC_ESCROW_V4_INITIAL_JOB_ID ?? "3000000");

export function getArcMode(): ArcMode {
  return process.env.NEXT_PUBLIC_ARC_MODE === "mock" ? "mock" : "onchain";
}

export function getOnchainReadiness() {
  const requiredAddresses = Object.entries(rawContractAddresses).filter(
    ([key]) => ["erc8004Registry", "erc8183EscrowV4", "usdc"].includes(key)
  );
  const missing = requiredAddresses
    .filter(([, value]) => !value)
    .map(([key]) => key);
  const invalid = Object.entries(rawContractAddresses)
    .filter(([key, value]) => value && (key === "usdc" ? value !== "native" : !isMainnetContractAddress(value)))
    .map(([key]) => key);

  return {
    mode: getArcMode(),
    isReady: missing.length === 0 && invalid.length === 0,
    missing,
    invalid
  };
}

export const deploymentScope = getDeploymentScope(contractAddresses.erc8004Registry, contractAddresses.erc8183EscrowV4);
