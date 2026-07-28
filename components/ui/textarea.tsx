import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-32 w-full min-w-0 max-w-full resize-y rounded-xl border border-[#1a2432] bg-[#070b13] px-4 py-3 text-sm text-foreground outline-none ring-offset-background placeholder:text-slate-700 focus:border-[#315476] focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";
