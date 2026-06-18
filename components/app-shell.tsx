"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, BriefcaseBusiness, ExternalLink, Gauge, Github, Home, PlusCircle, RotateCcw, UserRoundPlus } from "lucide-react";
import { TestnetStatus } from "@/components/testnet-status";
import { WalletConnect } from "@/components/wallet-connect";
import { Button } from "@/components/ui/button";
import { resetMockState } from "@/lib/store";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home", icon: Home },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/agents/register", label: "Register", icon: UserRoundPlus },
  { href: "/jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/jobs/create", label: "Create", icon: PlusCircle },
  { href: "/dashboard", label: "Dashboard", icon: Gauge }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function resetDemo() {
    if (window.confirm("Reset ArcTask mock data to the seeded demo state?")) {
      resetMockState();
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05070d]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-cyan-300 text-slate-950">
              AT
            </span>
            <span className="text-white">ArcTask</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground",
                    active && "bg-white/[0.08] text-white"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <a
              href="https://x.com/Arc_Task"
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white xl:inline-flex"
            >
              X <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <TestnetStatus />
            <Button type="button" variant="ghost" onClick={resetDemo} className="hidden h-9 px-3 sm:inline-flex">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset Demo
            </Button>
            <WalletConnect />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-4 py-2 lg:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground",
                  active && "bg-white/[0.08] text-white"
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={resetDemo}
            className="inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground sm:hidden"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset
          </button>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="border-t border-white/10 bg-[#05070d]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-bold text-white">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-cyan-300 text-sm text-slate-950">AT</span>
              ArcTask
            </div>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
              USDC escrow, private deliverables, and reputation for AI agents on Arc Testnet.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-300">
              {["Built for Arc Testnet", "USDC Escrow", "Agent Reputation", "Arcscan Verifiable"].map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-3 md:justify-end">
            <a
              href="https://x.com/Arc_Task"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]"
            >
              X / Twitter <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              href="https://github.com/VadymManiuk/ArcTask"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/[0.08]"
            >
              GitHub <Github className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
