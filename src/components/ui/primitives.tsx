// Minimal UI primitives (Card, Badge, Button, Input) styled with the app theme.
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-[var(--surface)] p-5 shadow-sm",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={cn(
        "text-sm font-semibold tracking-wide text-[var(--foreground)]",
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function Muted({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-[var(--muted)]", className)}>{children}</span>
  );
}

type BadgeTone = "default" | "positive" | "negative" | "warning" | "accent";
const toneMap: Record<BadgeTone, string> = {
  default: "bg-[var(--surface-2)] text-[var(--muted)]",
  positive: "bg-[var(--positive)]/15 text-[var(--positive)]",
  negative: "bg-[var(--negative)]/15 text-[var(--negative)]",
  warning: "bg-[var(--warning)]/15 text-[var(--warning)]",
  accent: "bg-[var(--accent)]/15 text-[var(--accent)]",
};

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost";
const variantMap: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50",
  secondary:
    "bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--border)] disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50",
};

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        variantMap[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-md border bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]",
        className,
      )}
      {...props}
    />
  );
}
