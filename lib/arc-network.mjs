// Shared by the browser, Next.js APIs and Node workers. Mainnet never falls back to testnet.
export const ARC_MAINNET = Object.freeze({
  chainId: 5042,
  chainName: "Arc Mainnet",
  rpcUrl: "https://rpc.arc-scan.org",
  explorerUrl: "https://arc-scan.org",
  multicall3Address: "0xcA11bde05977b3631167028862bE2a173976CA11",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }
});

export const defaultContractAddresses = Object.freeze({
  erc8004Registry: "",
  erc8183Escrow: "",
  erc8183EscrowV2: "",
  erc8183EscrowV3: "",
  erc8183EscrowV4: "",
  usdc: "native"
});

const testnetContracts = new Set([
  "0xd8499627775ac67cd756335a3c48387d0aff5553",
  "0x08eb8630f6b5d2c1c030688076b80360531a2e9a",
  "0x6255f3fbb7b4f82062b929029dc005baf0ca3ebb",
  "0x548531bbe48db4cded53da0d30998e7553eee53f",
  "0xb4791ed947067daf445c936ee44cedec949bdbb4"
]);

export function isMainnetContractAddress(value) {
  return typeof value === "string" && /^0x[\da-f]{40}$/i.test(value)
    && !/^0x0{40}$/i.test(value) && !testnetContracts.has(value.toLowerCase());
}

export function getArcChain(env = {}) {
  const rpcUrl = env.NEXT_PUBLIC_ARC_RPC_URL || ARC_MAINNET.rpcUrl;
  const explorerUrl = env.NEXT_PUBLIC_ARC_EXPLORER_URL || ARC_MAINNET.explorerUrl;
  for (const value of [rpcUrl, explorerUrl, env.ARC_AGENT_READ_RPC_URL, env.ARC_SECONDARY_RPC_URL].filter(Boolean)) {
    const url = new URL(value);
    if (url.protocol !== "https:" || /testnet/i.test(url.hostname)) {
      throw new Error("Arc mainnet requires an HTTPS mainnet RPC and explorer.");
    }
  }
  return {
    id: ARC_MAINNET.chainId,
    name: ARC_MAINNET.chainName,
    nativeCurrency: ARC_MAINNET.nativeCurrency,
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: "Arcscan", url: explorerUrl } },
    contracts: { multicall3: { address: ARC_MAINNET.multicall3Address } },
    testnet: false
  };
}

export function getDeploymentScope(registry, escrow) {
  return `${ARC_MAINNET.chainId}-${(registry || "unconfigured").toLowerCase()}-${(escrow || "unconfigured").toLowerCase()}`;
}

export async function assertArcMainnet(client) {
  const chainId = await client.getChainId();
  if (chainId !== ARC_MAINNET.chainId) {
    throw new Error(`Wrong RPC network: expected Arc mainnet ${ARC_MAINNET.chainId}, received ${chainId}.`);
  }
}

export async function assertArcContracts(client, addresses) {
  await assertArcMainnet(client);
  for (const address of addresses) {
    if (!isMainnetContractAddress(address)) {
      throw new Error(`Missing or invalid Arc mainnet contract: ${address || "not configured"}.`);
    }
    const code = await client.getCode({ address });
    if (!code || code === "0x") throw new Error(`No mainnet contract bytecode at ${address}.`);
  }
}
