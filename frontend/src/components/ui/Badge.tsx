import type { ReactNode } from "react";

const Badge = ({ children }: { children: ReactNode }) => {
  return (
    <div className="mb-4 flex items-center justify-center rounded-full border border-border bg-surface px-3 py-1">
      <span className="text-[10px] font-medium tracking-wider text-muted">
        {children}
      </span>
    </div>
  );
};

export default Badge;
