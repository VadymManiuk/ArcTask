import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-teal-800",
  secondary: "bg-secondary text-secondary-foreground hover:bg-amber-400",
  outline: "border border-border bg-white hover:bg-muted",
  ghost: "hover:bg-muted",
  danger: "bg-destructive text-destructive-foreground hover:bg-red-700"
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, variant = "primary", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variantClass[variant],
        className
      )}
      {...props}
    />
  );
}
