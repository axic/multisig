import type { ButtonHTMLAttributes } from "react";

/**
 * Buttons. Ink is the workhorse; signal is reserved for the one action that
 * changes a signature's state (Sign & execute). Zero radius, mono-free labels.
 */
export type ButtonVariant = "primary" | "secondary" | "tertiary" | "signal";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper border border-ink hover:bg-ink-hover hover:border-ink-hover",
  secondary: "bg-transparent text-ink border border-ink hover:bg-panel",
  tertiary: "bg-transparent text-body border border-line hover:text-ink hover:border-ink",
  signal: "bg-signal text-white border border-signal hover:bg-signal-hover hover:border-signal-hover",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "text-xs px-3.5 py-2",
  md: "text-sm px-5 py-3",
  lg: "text-base px-7 py-4",
};

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center gap-2 font-sans font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:border-line disabled:bg-panel disabled:text-faint disabled:hover:bg-panel",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper",
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
