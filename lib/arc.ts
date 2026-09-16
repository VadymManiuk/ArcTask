import { ARC_MAINNET as defaults, getArcChain } from "@/lib/arc-network.mjs";

const chain = getArcChain({
  NEXT_PUBLIC_ARC_RPC_URL: process.env.NEXT_PUBLIC_ARC_RPC_URL,
  NEXT_PUBLIC_ARC_EXPLORER_URL: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL
});
export const ARC_MAINNET = {
  ...defaults,
  rpcUrl: chain.rpcUrls.default.http[0],
  readRpcUrls: [chain.rpcUrls.default.http[0]],
  explorerUrl: chain.blockExplorers.default.url
};

export function getArcscanTxUrl(txHash: string) {
  return `${ARC_MAINNET.explorerUrl}/tx/${txHash}`;
}

export function createMockTxHash() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
