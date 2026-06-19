import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-[linear-gradient(135deg,#0f55d8_0%,#15c8d8_58%,#16d9b8_100%)] text-slate-950 shadow-[0_0_18px_rgba(25,230,242,0.16)] hover:brightness-105",
  secondary: "bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.18)] hover:bg-blue-500",
  outline: "border border-white/20 bg-white/[0.04] text-foreground hover:bg-white/[0.08]",
  ghost: "text-foreground hover:bg-white/[0.08]",
  danger: "bg-destructive text-destructive-foreground hover:bg-red-700"
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 max-w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variantClass[variant],
        className
      )}
      {...props}
    />
  );
}
