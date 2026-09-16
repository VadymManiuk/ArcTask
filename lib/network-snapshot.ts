import type { JobStatus } from "@/lib/types";

const jobStatusProgress: Record<JobStatus, number> = {
  FUNDED: 0,
  SUBMITTED: 1,
  DISPUTED: 2,
  ACCEPTED: 2,
  REJECTED: 2,
  REFUNDED: 2
};

const terminalJobStatuses = new Set<JobStatus>(["ACCEPTED", "REJECTED", "REFUNDED"]);

function getMaximumOnchainId(values: Array<string | undefined>) {
  return values.reduce<bigint | null>((maximum, value) => {
    if (!value || !/^\d+$/.test(value)) {
      return maximum;
    }

    const id = BigInt(value);
    return maximum === null || id > maximum ? id : maximum;
  }, null);
}

function isSequenceRegressive(currentIds: Array<string | undefined>, incomingNextId?: string) {
  const currentMaximum = getMaximumOnchainId(currentIds);
  if (currentMaximum === null) {
    return false;
  }

  if (!incomingNextId || !/^\d+$/.test(incomingNextId)) {
    return true;
  }

  return BigInt(incomingNextId) <= currentMaximum;
}

export function isNetworkSnapshotRegressive(input: {
  currentAgentIds: Array<string | undefined>;
  currentJobIds: Array<string | undefined>;
  incomingNextAgentId?: string;
  incomingNextJobId?: string;
}) {
  return (
    isSequenceRegressive(input.currentAgentIds, input.incomingNextAgentId) ||
    isSequenceRegressive(input.currentJobIds, input.incomingNextJobId)
  );
}

export function mergeOnchainJobStatus(currentStatus: JobStatus | undefined, incomingStatus: JobStatus,
  freshness?: { currentUpdatedAt: string; incomingUpdatedAt: string; currentVersion?: number; incomingVersion?: number; currentBlock?: string; incomingBlock?: string }) {
  if (!currentStatus) {
    return incomingStatus;
  }

  if (terminalJobStatuses.has(currentStatus)) {
    return currentStatus;
  }

  if (freshness?.currentBlock && freshness.incomingBlock && BigInt(freshness.incomingBlock) > BigInt(freshness.currentBlock)) return incomingStatus;

  if (freshness && ((freshness.incomingVersion ?? 1) > (freshness.currentVersion ?? 1) ||
      Date.parse(freshness.incomingUpdatedAt) > Date.parse(freshness.currentUpdatedAt))) return incomingStatus;

  return jobStatusProgress[incomingStatus] >= jobStatusProgress[currentStatus] ? incomingStatus : currentStatus;
}
