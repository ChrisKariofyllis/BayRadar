import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950 shadow-sm ring-1 ring-white/10 hover:from-amber-200 hover:to-amber-400",
        secondary:
          "bg-white/[0.06] text-zinc-100 shadow-sm ring-1 ring-white/10 hover:bg-white/[0.1]",
        outline:
          "border border-white/[0.1] bg-transparent text-zinc-100 hover:bg-white/[0.05]",
        ghost: "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-50",
        danger: "bg-red-500/90 text-white shadow-sm ring-1 ring-white/10 hover:bg-red-500",
        destructive:
          "text-muted-foreground hover:bg-red-500/10 hover:text-red-400",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-3.5",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
  };

export function Button({ className, variant, size, loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
