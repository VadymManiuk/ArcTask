export const ARC_TESTNET = {
  chainName: "Arc Testnet",
  chainId: 5042002,
  rpcUrl: "https://rpc.testnet.arc.network",
  explorerUrl: "https://testnet.arcscan.app",
  multicall3Address: "0xcA11bde05977b3631167028862bE2a173976CA11",
  nativeCurrency: {
    name: "testnet USDC",
    symbol: "USDC",
    decimals: 18
  }
} as const;

export function getArcscanTxUrl(txHash: string) {
  return `${ARC_TESTNET.explorerUrl}/tx/${txHash}`;
}

export function createMockTxHash() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
