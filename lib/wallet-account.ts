export type WalletAddress = `0x${string}`;

export function getAuthorizedAccount(accounts: unknown): WalletAddress | null {
  if (!Array.isArray(accounts)) {
    return null;
  }

  const account = accounts.find((value): value is string => typeof value === "string" && Boolean(value));
  if (!account || !/^0x[a-fA-F0-9]{40}$/.test(account)) {
    return null;
  }

  return account as WalletAddress;
}
