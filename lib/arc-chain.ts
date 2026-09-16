import { defineChain } from "viem";
import { getArcChain } from "@/lib/arc-network.mjs";

export const arcMainnet = defineChain(getArcChain({
  NEXT_PUBLIC_ARC_RPC_URL: process.env.NEXT_PUBLIC_ARC_RPC_URL,
  NEXT_PUBLIC_ARC_EXPLORER_URL: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL
}));
