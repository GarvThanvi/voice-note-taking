import { Bookmark, Trash2, Archive, ArchiveRestore, Undo2, X } from "lucide-react";
import type { Note } from "../../api/noteApi";

interface NoteCardProps {
  note: Note;
  onClick: () => void;
  onToggleFavorite: (noteId: number, bookmarked: boolean) => void;
  onDelete: (noteId: number) => void;
  onArchive?: (noteId: number) => void;
  onRestore?: (noteId: number) => void;
  onPermanentDelete?: (noteId: number) => void;
  filter?: string;
}

const NoteCard = ({ note, onClick, onToggleFavorite, onDelete, onArchive, onRestore, onPermanentDelete, filter }: NoteCardProps) => {
  return (
    <article
      onClick={onClick}
      className="
        group
        relative
        min-h-[235px]
        rounded-xl
        border
        border-border
        bg-surface
        p-5
        flex
        flex-col
        cursor-pointer
        hover:border-primary/40
        hover:bg-surface-elevated
        transition-all
        duration-200
      "
    >
      <h2 className="text-[16px] font-semibold leading-6 text-foreground pr-7 line-clamp-2">
        {note.title || "Untitled"}
      </h2>

      <div className="mt-3 text-sm text-muted leading-6 whitespace-pre-line line-clamp-5">
        {note.type === "CHECKBOX" && note.todos
          ? note.todos.map((todo) => `${todo.done ? "✓" : "□"} ${todo.text}`).join("\n")
          : note.content}
      </div>

      <div className="mt-auto pt-5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {new Date(note.updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>

          <div className="flex items-center gap-1">
            {filter === "trash" ? (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore?.(note.id);
                  }}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  title="Restore"
                >
                  <Undo2 size={17} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPermanentDelete?.(note.id);
                  }}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
                    w-8 h-8 rounded-md flex items-center justify-center transition-colors
                    ${note.bookmarked ? "text-yellow-400" : "text-muted-foreground hover:text-foreground"}
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
                    className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
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
                    className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
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
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Move to trash"
                >
                  <Trash2 size={17} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

export default NoteCard;
