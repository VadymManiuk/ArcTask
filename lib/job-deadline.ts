const endOfDayUtcSuffix = "T23:59:59Z";

export function getJobDeadlineMs(dateInputValue: string) {
  const parsed = Date.parse(`${dateInputValue}${endOfDayUtcSuffix}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInputValue) || !Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== dateInputValue) {
    throw new Error("Deadline must be a valid date.");
  }

  return parsed;
}

export function getJobDeadlineSeconds(dateInputValue: string) {
  return BigInt(Math.floor(getJobDeadlineMs(dateInputValue) / 1000));
}
