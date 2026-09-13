import { Search, Moon, Sun, Grid2X2, List, Info } from "lucide-react";
import { useState, useEffect } from "react";
import Sidebar from "../components/NotePage/Sidebar";
import NoteCard from "../components/NotePage/NoteCard";
import NoteListItem from "../components/NotePage/NoteListItem";
import NoteModal from "../components/NotePage/NoteModal";
import VoiceControl from "../components/NotePage/VoiceControl";
import {
  getNotes,
  updateNote,
  deleteNote,
  permanentDeleteNote,
  emptyTrash,
} from "../api/noteApi";
import { useTheme } from "../context/ThemeContext";
import { useDebounce } from "../hooks/useDebounce";
import type { Note } from "../api/noteApi";

const Note = () => {
  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [retryCount, setRetryCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [toast, setToast] = useState<{ message: string; type: "success" | "info" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const fetchNotes = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getNotes({
          bookmarked: activeFilter === "bookmark",
          archived: activeFilter === "archive",
          trashed: activeFilter === "trash",
          search: debouncedSearch || undefined,
        });
        if (!cancelled) {
          setNotes(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load notes");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchNotes();
    return () => {
      cancelled = true;
    };
  }, [activeFilter, retryCount, debouncedSearch]);

  const handleToggleFavorite = async (noteId: number, bookmarked: boolean) => {
    try {
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, bookmarked: !bookmarked } : n))
      );
      await updateNote(noteId, { bookmarked: !bookmarked });
    } catch {
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, bookmarked } : n))
      );
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    try {
      const noteTitle = notes.find((n) => n.id === noteId)?.title || "Note";
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      await updateNote(noteId, { deletedAt: new Date().toISOString(), archived: false });
      setToast({ message: `"${noteTitle}" moved to trash. You can restore it from Trash.`, type: "info" });
    } catch {
      setRetryCount((c) => c + 1);
    }
  };

  const handleArchiveNote = async (noteId: number) => {
    try {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      const updated = await updateNote(noteId, { archived: !note.archived });
      if (activeFilter === "all" || activeFilter === "archive") {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      } else {
        setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
      }
      const noteTitle = note.title || "Note";
      setToast({
        message: updated.archived
          ? `"${noteTitle}" archived`
          : `"${noteTitle}" unarchived`,
        type: "info",
      });
    } catch {
      setRetryCount((c) => c + 1);
    }
  };

  const handleRestoreNote = async (noteId: number) => {
    try {
      await updateNote(noteId, { deletedAt: null });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      setRetryCount((c) => c + 1);
    }
  };

  const handlePermanentDelete = async (noteId: number) => {
    try {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      await permanentDeleteNote(noteId);
    } catch {
      setRetryCount((c) => c + 1);
    }
  };

  const handleEmptyTrash = async () => {
    try {
      await emptyTrash();
      setNotes([]);
    } catch {
      setRetryCount((c) => c + 1);
    }
  };

  const handleOpenModal = (note: Note) => {
    setSelectedNote(note);
    setModalOpen(true);
  };

  const handleNewNote = () => {
    setSelectedNote(null);
    setModalOpen(true);
  };

  const handleNoteCreated = (note: Note) => {
    if (activeFilter === "all") {
      setNotes((prev) => [note, ...prev]);
    }
    setModalOpen(false);
  };

  const handleNoteUpdated = (updated: Note) => {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  };

  const handleNoteDeleted = (noteId: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    setModalOpen(false);
  };

  const pageTitle =
    activeFilter === "archive"
      ? "Archive"
      : activeFilter === "trash"
        ? "Trash"
        : activeFilter === "bookmark"
          ? "Bookmark"
          : "All Notes";

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar
        onNewNote={handleNewNote}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      <main className="flex-1 min-w-0">
        <div className="max-w-[1500px] mx-auto px-8 py-5">
          <header className="flex items-center gap-5 mb-8">
            <div className="relative flex-1 max-w-[640px]">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="
                  w-full
                  h-10
                  bg-surface
                  border
                  border-border
                  rounded-lg
                  pl-11
                  pr-16
                  text-sm
                  text-foreground
                  placeholder:text-muted-foreground
                  outline-none
                  focus:border-primary/50
                  focus:ring-1
                  focus:ring-primary/20
                  transition-all
                "
              />
            </div>

            <div className="ml-auto flex items-center gap-5">
              <button
                onClick={toggleTheme}
                className="text-muted hover:text-foreground transition-colors"
              >
                {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
              </button>
            </div>
          </header>

          <div className="flex items-end justify-between mb-6">
            <div>
              <h1 className="text-[28px] font-semibold tracking-[-0.7px]">
                {pageTitle}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {notes.length} notes
              </p>
            </div>

            <div className="flex items-center p-1 rounded-lg border border-border bg-surface">
              <button
                onClick={() => setView("grid")}
                className={`
                  w-8 h-7 rounded-md flex items-center justify-center transition-colors
                  ${view === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}
                `}
              >
                <Grid2X2 size={16} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`
                  w-8 h-7 rounded-md flex items-center justify-center transition-colors
                  ${view === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}
                `}
              >
                <List size={17} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-sm text-muted-foreground">Loading notes...</div>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  setRetryCount((c) => c + 1);
                }}
                className="text-sm text-primary hover:text-primary-hover transition-colors"
              >
                Try again
              </button>
            </div>
          ) : notes.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-muted-foreground">
                {activeFilter === "trash"
                  ? "Trash is empty"
                  : activeFilter === "archive"
                    ? "No archived notes"
                    : "No notes found"}
              </p>
            </div>
          ) : (
            <>
              {activeFilter === "trash" && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={handleEmptyTrash}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    Empty trash
                  </button>
                </div>
              )}

              {view === "grid" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                  {notes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onClick={() => handleOpenModal(note)}
                      onToggleFavorite={handleToggleFavorite}
                      onDelete={handleDeleteNote}
                      onArchive={handleArchiveNote}
                      onRestore={handleRestoreNote}
                      onPermanentDelete={handlePermanentDelete}
                      filter={activeFilter}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {notes.map((note) => (
                    <NoteListItem
                      key={note.id}
                      note={note}
                      onClick={() => handleOpenModal(note)}
                      onToggleFavorite={handleToggleFavorite}
                      onDelete={handleDeleteNote}
                      onArchive={handleArchiveNote}
                      onRestore={handleRestoreNote}
                      onPermanentDelete={handlePermanentDelete}
                      filter={activeFilter}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <NoteModal
        key={selectedNote?.id ?? "new"}
        isOpen={modalOpen}
        note={selectedNote}
        onClose={() => setModalOpen(false)}
        onNoteCreated={handleNoteCreated}
        onNoteUpdated={handleNoteUpdated}
        onNoteDeleted={handleNoteDeleted}
        onArchive={handleArchiveNote}
      />

      <VoiceControl
        onActionDone={(note) => {
          if (note) {
            setNotes((prev) => {
              const exists = prev.find((n) => n.id === note.id);
              if (exists) {
                return prev.map((n) => (n.id === note.id ? note : n));
              }
              return [note, ...prev];
            });
            setSelectedNote(note);
            setModalOpen(true);
          } else {
            setRetryCount((c) => c + 1);
          }
        }}
        onUndo={() => {
          setModalOpen(false);
          setRetryCount((c) => c + 1);
        }}
        onSearch={(query) => {
          setSearchQuery(query);
        }}
      />

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100]">
          <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
            <Info size={16} className="text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default Note;
