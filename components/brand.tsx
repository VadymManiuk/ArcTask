import { cn } from "@/lib/utils";

export function BrandWordmark({ className }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center font-semibold tracking-[-0.025em] text-white", className)}>
      <span className="truncate text-base">ArcTask</span>
    </span>
  );
}
