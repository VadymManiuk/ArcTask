import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "border border-[#42adff]/30 bg-[#1689e8] text-white shadow-[0_8px_28px_rgba(13,124,220,0.16)] hover:bg-[#2b9cff]",
  secondary: "border border-blue-400/20 bg-blue-600 text-white hover:bg-blue-500",
  outline: "border border-white/[0.09] bg-[#0c111b] text-foreground hover:border-white/[0.16] hover:bg-[#111824]",
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
        "inline-flex h-10 max-w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variantClass[variant],
        className
      )}
      {...props}
    />
  );
}
