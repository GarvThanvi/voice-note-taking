import { Search, Moon, Sun, Grid2X2, List } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import Sidebar from "../components/NotePage/Sidebar";
import NoteCard from "../components/NotePage/NoteCard";
import NoteListItem from "../components/NotePage/NoteListItem";
import NoteModal from "../components/NotePage/NoteModal";
import { getNotes, updateNote, deleteNote } from "../api/noteApi";
import { useTheme } from "../context/ThemeContext";
import type { Note } from "../api/noteApi";

const Note = () => {
  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery]);

  useEffect(() => {
    let cancelled = false;
    const fetchNotes = async () => {
      try {
        setLoading(true);
        setError(null);
        const isBookmarked = activeFilter === "bookmark";
        const data = await getNotes(isBookmarked, debouncedSearch || undefined);
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
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      await deleteNote(noteId);
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

  const pageTitle = activeFilter === "bookmark" ? "Bookmark" : "All Notes";

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
              <p className="text-sm text-muted-foreground">No notes found</p>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onClick={() => handleOpenModal(note)}
                  onToggleFavorite={handleToggleFavorite}
                  onDelete={handleDeleteNote}
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
                />
              ))}
            </div>
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
      />
    </div>
  );
};

export default Note;
