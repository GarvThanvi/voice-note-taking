import { Circle } from "lucide-react";
import { motion } from "framer-motion";

type StatusPillSize = "sm" | "md" | "bare";

interface StatusPillProps {
  label: string;
  pulsing?: boolean;
  size?: StatusPillSize;
  className?: string;
}

const SIZE_CLASSES: Record<StatusPillSize, string> = {
  sm: "gap-2 rounded-full border border-border-subtle bg-surface-elevated/60 px-3 py-1.5",
  md: "gap-2 rounded-full border border-border bg-surface-elevated px-4 py-2 shadow-lg",
  bare: "gap-2",
};

const StatusPill = ({
  label,
  pulsing = false,
  size = "sm",
  className = "",
}: StatusPillProps) => {
  const dot = (
    <Circle size={7} fill="currentColor" className="text-primary" />
  );

  return (
    <div
      className={`inline-flex items-center ${SIZE_CLASSES[size]} ${className}`}
    >
      {pulsing ? (
        <motion.span
          className="flex items-center"
          animate={{ opacity: [1, 0.35, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          {dot}
        </motion.span>
      ) : (
        <span className="flex items-center">{dot}</span>
      )}

      <span className="text-xs text-muted">{label}</span>
    </div>
  );
};

export default StatusPill;
