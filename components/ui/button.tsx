import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "border border-[#42adff]/25 bg-[#1689e8] text-white hover:bg-[#2b9cff]",
  secondary: "border border-blue-400/20 bg-blue-600 text-white hover:bg-blue-500",
  outline: "border border-[#1b2432] bg-[#0b0f17] text-foreground hover:border-[#2b3749] hover:bg-[#111722]",
  ghost: "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground",
  danger: "bg-destructive text-destructive-foreground hover:bg-red-700"
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 max-w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variantClass[variant],
        className
      )}
      {...props}
    />
  );
}
