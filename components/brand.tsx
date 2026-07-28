import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandWordmark({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5 font-semibold tracking-[-0.025em] text-white", className)}>
      <span
        className={cn(
          "relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-[#42adff]/25 bg-[#0c1724]",
          markClassName
        )}
        aria-hidden="true"
      >
        <Image src="/brand/arctask-mark.png" alt="" fill sizes="40px" className="object-cover" />
      </span>
      <span className="truncate text-base">ArcTask</span>
    </span>
  );
}
