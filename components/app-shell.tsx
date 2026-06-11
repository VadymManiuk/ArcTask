"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, BriefcaseBusiness, Gauge, Home, PlusCircle, RotateCcw, UserRoundPlus } from "lucide-react";
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
  { href: "/jobs/create", label: "Create Job", icon: PlusCircle },
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
              AT
            </span>
            <span>ArcTask</span>
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
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground",
                    active && "bg-muted text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <TestnetStatus />
            <Button type="button" variant="ghost" onClick={resetDemo} className="hidden h-9 px-3 sm:inline-flex">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset Demo
            </Button>
            <WalletConnect />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 lg:hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground",
                  active && "bg-muted text-foreground"
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
    </div>
  );
}
