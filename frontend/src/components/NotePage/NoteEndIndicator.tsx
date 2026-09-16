import { motion } from "framer-motion";
import NoteSkeleton from "./NoteSkeleton";

interface NoteEndIndicatorProps {
  hasMore: boolean;
  loadingMore: boolean;
  variant: "grid" | "list";
  error?: string | null;
  onRetry?: () => void;
}

const NoteEndIndicator = ({
  hasMore,
  loadingMore,
  variant,
  error,
  onRetry,
}: NoteEndIndicatorProps) => {
  if (hasMore) {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 py-8">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={onRetry}
            className="text-sm text-primary hover:text-primary-hover transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    if (!loadingMore) return null;

    return variant === "list" ? (
      <div className="space-y-2 mt-4">
        <NoteSkeleton variant="list" />
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 mt-4">
        <NoteSkeleton variant="grid" />
      </div>
    );
  }

  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: -24, bottom: 24 }}
      dragElastic={0.6}
      dragSnapToOrigin
      className="flex flex-col items-center justify-center gap-2 py-10 select-none cursor-grab active:cursor-grabbing"
    >
      <span className="h-1.5 w-10 rounded-full bg-border" />
      <p className="text-xs text-muted-foreground">You're all caught up</p>
    </motion.div>
  );
};

export default NoteEndIndicator;
