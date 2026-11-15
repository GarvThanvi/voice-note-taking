import { X } from "lucide-react";
import type { NoteLabel } from "../../api/labelApi";
import { hexToRgba, readableTextColor } from "../../lib/labelStyle";

interface LabelChipProps {
  label: NoteLabel;
  onClick?: (label: NoteLabel) => void;
  onRemove?: (label: NoteLabel) => void;
  title?: string;
  className?: string;
}

const BASE =
  "inline-flex max-w-[120px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4";

const LabelChip = ({
  label,
  onClick,
  onRemove,
  title,
  className = "",
}: LabelChipProps) => {
  const style = {
    backgroundColor: label.color,
    color: readableTextColor(label.color),
    borderColor: hexToRgba("#000000", 0.18),
  };

  const content = (
    <>
      <span className="truncate">{label.name}</span>
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Remove ${label.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(label);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onRemove(label);
            }
          }}
          className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
        >
          <X size={11} />
        </span>
      )}
    </>
  );

  if (onClick && !onRemove) {
    return (
      <button
        type="button"
        title={title ?? label.name}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          onClick(label);
        }}
        className={`${BASE} cursor-pointer transition-opacity hover:opacity-90 ${className}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span title={title ?? label.name} style={style} className={`${BASE} ${className}`}>
      {content}
    </span>
  );
};

export default LabelChip;
