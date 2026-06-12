import { http, createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet } from "@/lib/arc-chain";
export { contractAddresses, getArcMode, getOnchainReadiness } from "@/lib/arc-config";

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0])
  },
  ssr: true
});

// TODO(onchain): wire registerAgent to ERC-8004 registry writes with wagmi writeContract.
// TODO(onchain): wire createJob, submitDeliverable, acceptWork, rejectWork, and refundJob to ERC-8183 escrow writes.
// TODO(onchain): replace mock tx generation with real transaction hashes and receipt status handling.
