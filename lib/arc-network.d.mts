import type { Address, Chain } from "viem";
export const ARC_MAINNET: {
  readonly chainId: 5042;
  readonly chainName: string;
  readonly rpcUrl: string;
  readonly explorerUrl: string;
  readonly multicall3Address: Address;
  readonly nativeCurrency: { name: string; symbol: string; decimals: 18 };
};
export const defaultContractAddresses: Readonly<{
  erc8004Registry: string; erc8183Escrow: string; erc8183EscrowV2: string;
  erc8183EscrowV3: string; erc8183EscrowV4: string; usdc: string;
}>;
export function isMainnetContractAddress(value: unknown): value is Address;
export function getArcChain(env?: Record<string, string | undefined>): Chain & {
  rpcUrls: { default: { http: [string] } };
  blockExplorers: { default: { name: string; url: string } };
};
export function getDeploymentScope(registry?: string, escrow?: string): string;
export function assertArcMainnet(client: { getChainId(): Promise<number> }): Promise<void>;
export function assertArcContracts(client: {
  getChainId(): Promise<number>;
  getCode(args: { address: Address }): Promise<`0x${string}` | undefined>;
}, addresses: string[]): Promise<void>;
