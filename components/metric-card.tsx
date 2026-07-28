import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function MetricCard({
  title,
  value,
  icon: Icon
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 p-5 sm:p-5">
        <div>
          <p className="text-xs text-slate-600">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{value}</p>
        </div>
        <span className="rounded-lg border border-[#42adff]/15 bg-[#42adff]/[0.07] p-3 text-[#65bbff]">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}
