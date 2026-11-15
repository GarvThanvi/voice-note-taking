import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Label } from "../../api/labelApi";
import LabelChip from "./LabelChip";
import LabelModal from "./LabelModal";

interface LabelPickerProps {
  labels: Label[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  onCreateLabel: (data: { name: string; color: string }) => Promise<Label>;
  disabled?: boolean;
}

const LabelPicker = ({
  labels,
  selectedIds,
  onChange,
  onCreateLabel,
  disabled = false,
}: LabelPickerProps) => {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = labels.filter((label) => selectedIds.includes(label.id));
  const available = labels.filter((label) => !selectedIds.includes(label.id));

  const assign = (labelId: number) => {
    onChange([...selectedIds, labelId]);
    setOpen(false);
  };

  const remove = (labelId: number) => {
    onChange(selectedIds.filter((id) => id !== labelId));
  };

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-1">
      {selected.map((label) => (
        <LabelChip
          key={label.id}
          label={label}
          onRemove={disabled ? undefined : () => remove(label.id)}
        />
      ))}

      {!disabled && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="Add label"
          aria-expanded={open}
          className="w-6 h-6 rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 flex items-center justify-center transition-colors"
        >
          <Plus size={13} />
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-full mt-2 z-40 w-56 max-h-56 overflow-y-auto rounded-xl border border-border bg-background shadow-2xl p-1.5">
          {available.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted-foreground">
              {labels.length === 0 ? "No labels yet" : "All labels assigned"}
            </p>
          ) : (
            available.map((label) => (
              <button
                key={label.id}
                type="button"
                onClick={() => assign(label.id)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left hover:bg-surface transition-colors"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                <span className="truncate">{label.name}</span>
              </button>
            ))
          )}

          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 mt-1 rounded-lg text-sm text-primary hover:bg-primary/10 transition-colors border-t border-border-subtle pt-2"
          >
            <Plus size={14} />
            New label
          </button>
        </div>
      )}

      {creating && (
        <LabelModal
          isOpen
          label={null}
          onClose={() => setCreating(false)}
          onSubmit={async (data) => {
            const created = await onCreateLabel(data);
            onChange([...selectedIds, created.id]);
          }}
        />
      )}
    </div>
  );
};

export default LabelPicker;
