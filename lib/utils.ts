import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string) {
  if (!address) {
    return "Not connected";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatUsdc(amount: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function isAddressLike(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function splitCapabilities(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
