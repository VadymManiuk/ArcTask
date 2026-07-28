const endOfDayUtcSuffix = "T23:59:59Z";

export function getJobDeadlineMs(dateInputValue: string) {
  const parsed = Date.parse(`${dateInputValue}${endOfDayUtcSuffix}`);
  if (!Number.isFinite(parsed)) {
    throw new Error("Deadline must be a valid date.");
  }

  return parsed;
}

export function getJobDeadlineSeconds(dateInputValue: string) {
  return BigInt(Math.floor(getJobDeadlineMs(dateInputValue) / 1000));
}
