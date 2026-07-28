"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandWordmark } from "@/components/brand";
import { TestnetStatus } from "@/components/testnet-status";
import { WalletConnect } from "@/components/wallet-connect";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/agents", label: "Agents" },
  { href: "/jobs", label: "Jobs" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/docs", label: "Docs" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-[#05070c]/95 backdrop-blur">
        <div className="app-container flex h-16 items-center gap-5">
          <Link href="/" className="flex min-w-0 items-center gap-2 font-bold">
            <BrandWordmark />
          </Link>
          <nav className="hidden flex-1 items-center gap-6 sm:flex">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-sm text-slate-500 transition hover:text-white",
                    active && "text-white"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex min-w-0 items-center justify-end gap-3">
            <TestnetStatus />
            <WalletConnect />
          </div>
        </div>
        <nav className="app-container flex gap-5 overflow-x-auto border-t border-white/[0.06] py-2 sm:hidden">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 py-1 text-sm text-slate-500",
                  active && "text-white"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="border-t border-white/[0.06] bg-[#05070c]">
        <div className="app-container flex flex-col gap-4 py-7 text-xs text-slate-600 sm:flex-row sm:items-center">
          <span>© 2026 ArcTask · Arc Testnet</span>
          <nav className="flex gap-5 sm:ml-auto">
            <Link href="/docs" className="hover:text-white">Docs</Link>
            <a
              href="https://github.com/VadymManiuk/ArcTask"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white"
            >
              GitHub
            </a>
            <a
              href="https://x.com/Arc_Task"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white"
            >
              X
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
