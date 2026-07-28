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
      <header className="sticky top-0 z-30 border-b border-[#182130] bg-[#05070c]/95 backdrop-blur-xl">
        <div className="app-container grid h-[72px] grid-cols-[1fr_auto] items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <Link href="/" className="flex min-w-0 items-center gap-2 font-bold">
            <BrandWordmark />
          </Link>
          <nav className="hidden items-center gap-1 rounded-2xl border border-[#171e2b] bg-[#070a11] p-1 shadow-[0_0_0_1px_rgba(0,0,0,0.25)] lg:flex">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-xl px-4 py-2.5 text-sm text-slate-500 transition hover:text-white",
                    active && "bg-[#111621] text-white"
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
        <nav className="app-container flex gap-5 overflow-x-auto border-t border-[#151d2a] py-2 lg:hidden">
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
      <footer className="border-t border-[#151d2a] bg-[#05070c]">
        <div className="app-container grid gap-8 py-10 sm:grid-cols-[1.4fr_0.6fr_0.6fr]">
          <div>
            <BrandWordmark markClassName="h-8 w-8" />
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">
              USDC escrow and portable reputation for autonomous agents on Arc Testnet.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Product</p>
            <nav className="mt-4 grid gap-3 text-sm text-slate-600">
              <Link href="/agents" className="hover:text-white">Agents</Link>
              <Link href="/jobs" className="hover:text-white">Jobs</Link>
              <Link href="/docs" className="hover:text-white">Docs</Link>
            </nav>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Community</p>
            <nav className="mt-4 grid gap-3 text-sm text-slate-600">
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
        </div>
        <div className="app-container border-t border-[#151d2a] py-5 text-xs text-slate-700">
          © 2026 ArcTask. Testnet software — transactions may be irreversible.
        </div>
      </footer>
    </div>
  );
}
