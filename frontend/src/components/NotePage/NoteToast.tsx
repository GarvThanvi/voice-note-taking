import { Info, Undo2 } from "lucide-react";

interface NoteToastProps {
  message: string;
  undoable: boolean;
  undoing: boolean;
  onUndo: () => void;
}

const NoteToast = ({ message, undoable, undoing, onUndo }: NoteToastProps) => (
  <div className="fixed bottom-24 left-4 right-4 z-[100] sm:left-1/2 sm:right-auto sm:w-auto sm:max-w-md sm:-translate-x-1/2">
    <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      <Info size={16} className="mt-0.5 shrink-0 text-primary" />

      <span className="flex-1 text-sm font-medium leading-snug text-foreground">
        {message}
      </span>

      {undoable && (
        <button
          onClick={onUndo}
          disabled={undoing}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
        >
          <Undo2 size={13} />
          {undoing ? "Undoing…" : "Undo"}
        </button>
      )}
    </div>
  </div>
);

export default NoteToast;
