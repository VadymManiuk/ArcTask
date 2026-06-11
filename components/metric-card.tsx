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
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <span className="rounded-md bg-teal-50 p-3 text-teal-800">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </CardContent>
    </Card>
  );
}
