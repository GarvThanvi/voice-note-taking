import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "primary";
}

const Badge = ({ children, variant = "default" }: BadgeProps) => {
  const isPrimary = variant === "primary";

  return (
    <div
      className={`mb-4 inline-flex items-center justify-center gap-2 rounded-full border ${
        isPrimary
          ? "border-primary/25 bg-primary/5 px-3.5 py-1.5 shadow-[0_0_24px_rgba(255,64,88,0.15)]"
          : "border-border bg-surface px-3 py-1"
      }`}
    >
      {isPrimary && (
        <span
          aria-hidden
          className="animate-pulse h-1.5 w-1.5 rounded-full bg-primary"
        />
      )}

      <span
        className={`font-medium tracking-wider ${
          isPrimary
            ? "text-[11px] tracking-widest text-foreground"
            : "text-[10px] text-muted"
        }`}
      >
        {children}
      </span>
    </div>
  );
};

export default Badge;