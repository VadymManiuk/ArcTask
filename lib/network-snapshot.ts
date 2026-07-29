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
