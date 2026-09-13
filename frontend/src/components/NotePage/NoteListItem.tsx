import { Bookmark, Trash2, Archive, ArchiveRestore, Undo2, X } from "lucide-react";
import type { Note } from "../../api/noteApi";

interface NoteListItemProps {
  note: Note;
  onClick: () => void;
  onToggleFavorite: (noteId: number, bookmarked: boolean) => void;
  onDelete: (noteId: number) => void;
  onArchive?: (noteId: number) => void;
  onRestore?: (noteId: number) => void;
  onPermanentDelete?: (noteId: number) => void;
  filter?: string;
}

const NoteListItem = ({ note, onClick, onToggleFavorite, onDelete, onArchive, onRestore, onPermanentDelete, filter }: NoteListItemProps) => {
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
              onClick={(e) => {
                e.stopPropagation();
                onRestore?.(note.id);
              }}
              className="text-muted-foreground hover:text-primary transition-colors"
              title="Restore"
            >
              <Undo2 size={17} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPermanentDelete?.(note.id);
              }}
              className="text-muted-foreground hover:text-red-400 transition-colors"
              title="Delete permanently"
            >
              <X size={17} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(note.id, note.bookmarked);
              }}
              className={`
                text-muted-foreground hover:text-foreground
                ${note.bookmarked ? "text-yellow-400" : ""}
              `}
            >
              <Bookmark size={17} fill={note.bookmarked ? "currentColor" : "none"} />
            </button>

            {filter !== "archive" && onArchive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(note.id);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Archive"
              >
                <Archive size={17} />
              </button>
            )}

            {filter === "archive" && onArchive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(note.id);
                }}
                className="text-muted-foreground hover:text-primary transition-colors"
                title="Unarchive"
              >
                <ArchiveRestore size={17} />
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(note.id);
              }}
              className="text-muted-foreground hover:text-red-400 transition-colors"
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
