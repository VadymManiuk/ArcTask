import { keccak256, stringToHex, type Hex } from "viem";

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function getWorkerReportHash(value: unknown): Hex {
  const storedReport = getRecord(value);
  if (!storedReport) {
    throw new Error("Invalid worker deliverable file.");
  }

  const reportForHash = { ...storedReport };
  delete reportForHash.deliverableHash;
  delete reportForHash.txHash;
  delete reportForHash.txUrl;
  return keccak256(stringToHex(JSON.stringify(reportForHash, null, 2)));
}
