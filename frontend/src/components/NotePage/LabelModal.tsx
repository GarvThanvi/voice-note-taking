import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Label } from "../../api/labelApi";
import ConfirmModal from "../ui/ConfirmModal";
import LabelChip from "./LabelChip";
import { getApiErrorMessage } from "../../lib/apiError";

interface LabelModalProps {
  isOpen: boolean;
  label: Label | null;
  onClose: () => void;
  onSubmit: (data: { name: string; color: string }) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const PRESET_COLORS = [
  "#FF4058",
  "#F59E0B",
  "#22C55E",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#6B7280",
];

const DEFAULT_COLOR = "#FF4058";

const LabelModal = ({
  isOpen,
  label,
  onClose,
  onSubmit,
  onDelete,
}: LabelModalProps) => {
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState(label?.color ?? DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isOpen) return null;

  const trimmedName = name.trim();
  const colorIsValid = HEX_PATTERN.test(color);
  const canSave = trimmedName.length > 0 && trimmedName.length <= 30 && colorIsValid && !saving;

  const handleSubmit = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: trimmedName, color: color.toUpperCase() });
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not save the label"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setConfirmDelete(false);
    setSaving(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err, "Could not delete the label"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[130] flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={saving ? undefined : onClose}
        />

        <div className="relative w-[calc(100%-1.5rem)] sm:w-full max-w-sm bg-background border border-border rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-5 pt-5 pb-4">
            <h2 className="text-base font-semibold">
              {label ? "Edit label" : "New label"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Pick any color you like. The chip text adapts to stay readable.
            </p>
          </div>

          <div className="px-5 space-y-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Name
              </label>
              <input
                autoFocus
                type="text"
                value={name}
                maxLength={30}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                  if (e.key === "Escape" && !saving) onClose();
                }}
                placeholder="Work"
                className="w-full h-9 px-3 rounded-lg bg-surface border border-border text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick a color"
                  value={colorIsValid ? color : DEFAULT_COLOR}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  className="h-9 w-12 rounded-lg border border-border bg-surface cursor-pointer"
                />
                <input
                  type="text"
                  aria-label="Hex color"
                  value={color}
                  maxLength={7}
                  onChange={(e) => setColor(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit();
                  }}
                  className="w-28 h-9 px-3 rounded-lg bg-surface border border-border text-sm font-mono outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                />
                <div className="flex-1 flex justify-end">
                  <LabelChip
                    label={{ id: 0, name: trimmedName || "Preview", color: colorIsValid ? color : DEFAULT_COLOR }}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-label={`Use ${preset}`}
                    onClick={() => setColor(preset)}
                    style={{ backgroundColor: preset }}
                    className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                      color.toUpperCase() === preset ? "border-foreground" : "border-transparent"
                    }`}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>

          <div className="flex items-center justify-between gap-2 px-5 py-4 mt-4 border-t border-border">
            {label && onDelete ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all disabled:opacity-40"
              >
                <Trash2 size={14} />
                Delete
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface transition-all disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={handleSubmit}
                className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : label ? "Save changes" : "Create label"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete label"
        message="Delete this label? Notes keep their content; they just lose this label."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
};

export default LabelModal;
