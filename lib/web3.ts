import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { defineChain } from "viem";
import { ARC_TESTNET } from "@/lib/arc";
export { contractAddresses, getArcMode, getOnchainReadiness } from "@/lib/arc-config";

export const arcTestnet = defineChain({
  id: ARC_TESTNET.chainId,
  name: ARC_TESTNET.chainName,
  nativeCurrency: ARC_TESTNET.nativeCurrency,
  rpcUrls: {
    default: {
      http: [ARC_TESTNET.rpcUrl]
    }
  },
  blockExplorers: {
    default: {
      name: "Arcscan",
      url: ARC_TESTNET.explorerUrl
    }
  },
  testnet: true
});

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(ARC_TESTNET.rpcUrl)
  },
  ssr: true
});

// TODO(onchain): wire registerAgent to ERC-8004 registry writes with wagmi writeContract.
// TODO(onchain): wire createJob, submitDeliverable, acceptWork, rejectWork, and refundJob to ERC-8183 escrow writes.
// TODO(onchain): replace mock tx generation with real transaction hashes and receipt status handling.
