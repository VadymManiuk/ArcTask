import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className, imageClassName }: { className?: string; imageClassName?: string }) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-cyan-300/20 bg-[#030711] shadow-[0_0_24px_rgba(34,211,238,0.28)]",
        className
      )}
      aria-hidden="true"
    >
      <Image
        src="/brand/arctask-mark.png"
        alt=""
        width={160}
        height={160}
        priority={false}
        className={cn("h-full w-full object-cover", imageClassName)}
      />
    </span>
  );
}

export function BrandWordmark({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 font-bold text-white", className)}>
      <BrandMark className={cn("h-9 w-9", markClassName)} />
      <span className="truncate">ArcTask</span>
    </span>
  );
}

export function ArcLineBackdrop({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none select-none bg-[url('/brand/arctask-lines.png')] bg-cover bg-center opacity-45 mix-blend-screen",
        className
      )}
      aria-hidden="true"
    />
  );
}
