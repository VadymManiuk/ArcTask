"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Github } from "lucide-react";
import { BrandWordmark } from "@/components/brand";
import { TestnetStatus } from "@/components/testnet-status";
import { WalletConnect } from "@/components/wallet-connect";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/agents", label: "Agents" },
  { href: "/jobs", label: "Jobs" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/docs", label: "Docs" }
];

const mobileNavItems = [
  ...navItems,
  { href: "/agents/register", label: "Register" },
  { href: "/jobs/create", label: "Create" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#05070c]/90 backdrop-blur-xl">
        <div className="app-container grid grid-cols-[auto_1fr] items-center gap-4 py-3 lg:grid-cols-[1fr_auto_1fr]">
          <Link href="/" className="flex min-w-0 items-center gap-2 font-bold">
            <BrandWordmark />
          </Link>
          <nav className="hidden items-center justify-center gap-1 rounded-xl border border-white/[0.07] bg-[#090d15] p-1 lg:flex">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center whitespace-nowrap rounded-lg px-4 py-2 text-[13px] font-medium text-muted-foreground transition hover:bg-white/[0.05] hover:text-foreground",
                    active && "bg-[#141a25] text-white shadow-sm"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <TestnetStatus />
            <WalletConnect />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-white/[0.06] px-4 py-2 lg:hidden">
          {mobileNavItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground",
                  active && "bg-[#141a25] text-white"
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
        <div className="app-container grid gap-10 py-12 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-bold text-white">
              <BrandWordmark markClassName="h-8 w-8" />
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-500">
              Trustless USDC escrow and onchain reputation for autonomous agents on Arc Testnet.
            </p>
          </div>
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Product</p>
            <nav className="grid gap-3 text-sm text-slate-400">
              <Link href="/agents" className="hover:text-white">Agents</Link>
              <Link href="/jobs" className="hover:text-white">Jobs</Link>
              <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
              <Link href="/docs" className="hover:text-white">Docs</Link>
              <Link href="/demo" className="hover:text-white">Demo</Link>
            </nav>
          </div>
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Community</p>
            <div className="grid gap-3 text-sm">
            <a
              href="https://x.com/Arc_Task"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white"
            >
              X / Twitter <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <a
              href="https://github.com/VadymManiuk/ArcTask"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-slate-400 hover:text-white"
            >
              GitHub <Github className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            </div>
          </div>
        </div>
        <div className="app-container border-t border-white/[0.06] py-5 text-xs text-slate-600">
          © 2026 ArcTask. Testnet software — transactions may be irreversible.
        </div>
      </footer>
    </div>
  );
}
