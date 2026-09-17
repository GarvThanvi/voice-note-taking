interface NoteSkeletonProps {
  variant: "grid" | "list";
  count?: number;
}

const skeletonItems = (count: number) => Array.from({ length: count }, (_, i) => i);

const NoteSkeleton = ({ variant, count = 3 }: NoteSkeletonProps) => {
  if (variant === "list") {
    return (
      <>
        {skeletonItems(count).map((i) => (
          <article
            key={i}
            className="flex items-center gap-3 sm:gap-5 p-3 sm:p-5 rounded-xl border border-border bg-surface animate-pulse"
          >
            <div className="flex-1 min-w-0 space-y-3">
              <div className="h-3.5 w-1/3 rounded bg-border" />
              <div className="h-3 w-2/3 rounded bg-border" />
            </div>
            <div className="h-3 w-14 rounded bg-border" />
          </article>
        ))}
      </>
    );
  }

  return (
    <>
      {skeletonItems(count).map((i) => (
        <article
          key={i}
          className="min-h-[200px] sm:min-h-[235px] rounded-xl border border-border bg-surface p-4 sm:p-5 flex flex-col animate-pulse"
        >
          <div className="h-4 w-2/3 rounded bg-border" />
          <div className="mt-4 space-y-3">
            <div className="h-3 w-full rounded bg-border" />
            <div className="h-3 w-5/6 rounded bg-border" />
            <div className="h-3 w-4/6 rounded bg-border" />
          </div>
          <div className="mt-auto pt-5">
            <div className="h-3 w-16 rounded bg-border" />
          </div>
        </article>
      ))}
    </>
  );
};

export default NoteSkeleton;
