import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  title,
  value,
  className
}: {
  title: string;
  value: string | number;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardContent className="p-5 sm:p-5">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-600">{title}</p>
        <p className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{value}</p>
      </CardContent>
    </Card>
  );
}
