import { Bookmark, Trash2, Archive, ArchiveRestore, Undo2, X } from "lucide-react";
import type { Note } from "../../api/noteApi";

interface NoteListItemProps {
  note: Note;
  pending?: boolean;
  onClick: () => void;
  onToggleFavorite: (noteId: number, bookmarked: boolean) => void;
  onDelete: (noteId: number) => void;
  onArchive?: (noteId: number) => void;
  onRestore?: (noteId: number) => void;
  onPermanentDelete?: (noteId: number) => void;
  filter?: string;
}

const ACTION_BUTTON =
  "transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

const NoteListItem = ({ note, pending, onClick, onToggleFavorite, onDelete, onArchive, onRestore, onPermanentDelete, filter }: NoteListItemProps) => {
  return (
    <article
      onClick={onClick}
      className="
        group
        flex
        items-center
        gap-5
        p-5
        rounded-xl
        border
        border-border
        bg-surface
        hover:bg-surface-elevated
        hover:border-primary/30
        transition-all
        cursor-pointer
      "
    >
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold text-sm truncate">
          {note.title || "Untitled"}
        </h2>
        <p className="text-sm text-muted mt-1 truncate">
          {note.type === "CHECKBOX" && note.todos
            ? note.todos.map((todo) => `${todo.done ? "✓" : "□"} ${todo.text}`).join(" ")
            : (note.content || "").replace(/\n/g, " ")}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground w-[100px] text-right">
          {new Date(note.updatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>

        {filter === "trash" ? (
          <>
            <button
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                onRestore?.(note.id);
              }}
              className={`${ACTION_BUTTON} text-muted-foreground enabled:hover:text-primary`}
              title="Restore"
            >
              <Undo2 size={17} />
            </button>
            <button
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                onPermanentDelete?.(note.id);
              }}
              className={`${ACTION_BUTTON} text-muted-foreground enabled:hover:text-red-400`}
              title="Delete permanently"
            >
              <X size={17} />
            </button>
          </>
        ) : (
          <>
            <button
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(note.id, note.bookmarked);
              }}
              className={`
                ${ACTION_BUTTON}
                ${note.bookmarked ? "text-yellow-400" : "text-muted-foreground enabled:hover:text-foreground"}
              `}
            >
              <Bookmark size={17} fill={note.bookmarked ? "currentColor" : "none"} />
            </button>

            {filter !== "archive" && onArchive && (
              <button
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(note.id);
                }}
                className={`${ACTION_BUTTON} text-muted-foreground enabled:hover:text-foreground`}
                title="Archive"
              >
                <Archive size={17} />
              </button>
            )}

            {filter === "archive" && onArchive && (
              <button
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(note.id);
                }}
                className={`${ACTION_BUTTON} text-muted-foreground enabled:hover:text-primary`}
                title="Unarchive"
              >
                <ArchiveRestore size={17} />
              </button>
            )}

            <button
              disabled={pending}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(note.id);
              }}
              className={`${ACTION_BUTTON} text-muted-foreground enabled:hover:text-red-400`}
              title="Move to trash"
            >
              <Trash2 size={17} />
            </button>
          </>
        )}
      </div>
    </article>
  );
};

export default NoteListItem;
