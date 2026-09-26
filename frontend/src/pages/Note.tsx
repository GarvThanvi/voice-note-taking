import { Search, Moon, Sun, Grid2X2, List, Info, Menu, GripVertical, Undo2 } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Reorder, useDragControls } from "framer-motion";
import Sidebar from "../components/NotePage/Sidebar";
import NoteCard from "../components/NotePage/NoteCard";
import NoteListItem from "../components/NotePage/NoteListItem";
import NoteModal from "../components/NotePage/NoteModal";
import NoteSkeleton from "../components/NotePage/NoteSkeleton";
import NoteEndIndicator from "../components/NotePage/NoteEndIndicator";
import VoiceControl from "../components/NotePage/VoiceControl";
import VoiceGuideModal from "../components/NotePage/VoiceGuide/VoiceGuideModal";
import ConfirmModal from "../components/ui/ConfirmModal";
import {
  updateNote,
  permanentDeleteNote,
  emptyTrash,
  reorderNote,
} from "../api/noteApi";
import { updateGuidePreferences } from "../api/authApi";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useDebounce } from "../hooks/useDebounce";
import { useInfiniteNotes } from "../hooks/useInfiniteNotes";
import { useIntersectionObserver } from "../hooks/useIntersectionObserver";
import { usePendingActions } from "../hooks/usePendingActions";
import type { Note as NoteType } from "../api/noteApi";

interface DraggableNoteProps {
  id: number;
  className?: string;
  variant?: "grid" | "list";
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}

const DraggableNote = ({ id, className, variant = "grid", onDragStart, onDragEnd, children }: DraggableNoteProps) => {
  const controls = useDragControls();
  const isList = variant === "list";

  return (
    <Reorder.Item
      as="div"
      value={id}
      className={`relative group ${className ?? ""}`}
      dragListener={false}
      dragControls={controls}
      onDragStart={() => onDragStart(id)}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.03, zIndex: 30, boxShadow: "0 12px 32px rgba(0,0,0,0.28)" }}
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
    >
      <button
        type="button"
        onPointerDown={(e) => controls.start(e)}
        onClick={(e) => e.stopPropagation()}
        className={`
          absolute z-10 touch-none cursor-grab active:cursor-grabbing
          text-muted-foreground/60 hover:text-foreground transition-colors
          ${isList ? "left-2 top-1/2 -translate-y-1/2" : "right-3 top-3"}
        `}
        aria-label="Drag to reorder"
        title="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>

      {children}
    </Reorder.Item>
  );
};

const Note = () => {
  const { theme, toggleTheme } = useTheme();
  const { user, guideRequested, clearGuideRequest, setUser } = useAuth();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<NoteType | null>(null);
  const [newNoteKey, setNewNoteKey] = useState(0);
  const [activeFilter, setActiveFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideShowNextLogin, setGuideShowNextLogin] = useState<boolean | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "info"; onUndo?: () => void } | null>(null);
  const [undoingToast, setUndoingToast] = useState(false);

  const {
    notes,
    total,
    setNotes,
    setTotal,
    initialLoading,
    loadingMore,
    hasMore,
    error,
    loadMore,
    reset,
  } = useInfiniteNotes(activeFilter, debouncedSearch);

  const sentryRef = useIntersectionObserver(loadMore, {
    enabled: hasMore && !loadingMore && !error,
  });

  const { isPending, run } = usePendingActions();

  const draggingRef = useRef(false);
  const draggedIdRef = useRef<number | null>(null);

  const reorderEnabled = activeFilter === "all" && !debouncedSearch;

  const handleDragStart = useCallback((id: number) => {
    draggingRef.current = true;
    draggedIdRef.current = id;
  }, []);

  const handleDragEnd = useCallback(() => {
    window.setTimeout(() => {
      draggingRef.current = false;
    }, 0);
  }, []);

  const handleReorder = useCallback(
    (newOrder: number[]) => {
      const movedId = draggedIdRef.current;
      if (movedId === null) return;
      const noteMap = new Map(notes.map((n) => [n.id, n]));
      const reordered = newOrder
        .map((id) => noteMap.get(id))
        .filter((n): n is NoteType => Boolean(n));
      if (reordered.length !== notes.length) return;

      const index = newOrder.indexOf(movedId);
      const prevId = index > 0 ? newOrder[index - 1]! : null;
      const nextId = index < newOrder.length - 1 ? newOrder[index + 1]! : null;

      setNotes(reordered);
      reorderNote(movedId, prevId, nextId).catch(() => reset());
    },
    [notes, setNotes, reset]
  );

  const guardedOpen = (note: NoteType) => () => {
    if (draggingRef.current) return;
    handleOpenModal(note);
  };

  const defaultGuideShowOnLogin = user?.hasSeenGuide
    ? Boolean(user.showGuideOnLogin)
    : true;
  const guideIsOpen = guideOpen || guideRequested;
  const showOnNextLogin = guideShowNextLogin ?? defaultGuideShowOnLogin;

  const handleGuideClose = useCallback(() => {
    setGuideOpen(false);
    setGuideShowNextLogin(null);
    clearGuideRequest();
    updateGuidePreferences({
      hasSeenGuide: true,
      showGuideOnLogin: showOnNextLogin,
    })
      .then((data) => {
        if (data?.success && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});
  }, [showOnNextLogin, clearGuideRequest, setUser]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleToggleFavorite = (noteId: number, bookmarked: boolean) =>
    run(noteId, async () => {
      const nextBookmarked = !bookmarked;
      try {
        if (activeFilter === "bookmark" && !nextBookmarked) {
          setNotes((prev) => prev.filter((n) => n.id !== noteId));
          setTotal((prev) => Math.max(0, prev - 1));
        } else {
          setNotes((prev) =>
            prev.map((n) => (n.id === noteId ? { ...n, bookmarked: nextBookmarked } : n))
          );
        }
        await updateNote(noteId, { bookmarked: nextBookmarked });
      } catch {
        reset();
      }
    });

  const handleDeleteNote = (noteId: number) =>
    run(noteId, async () => {
      try {
        const noteTitle = notes.find((n) => n.id === noteId)?.title || "Note";
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        setTotal((prev) => Math.max(0, prev - 1));
        await updateNote(noteId, { deletedAt: new Date().toISOString(), archived: false });
        setToast({
          message: `"${noteTitle}" moved to trash`,
          type: "info",
          onUndo: async () => {
            await updateNote(noteId, { deletedAt: null });
            reset();
          },
        });
      } catch {
        reset();
      }
    });

  const handleArchiveNote = (noteId: number) =>
    run(noteId, async () => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      const nextArchived = !note.archived;
      try {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        setTotal((prev) => Math.max(0, prev - 1));
        await updateNote(noteId, { archived: nextArchived });
        const noteTitle = note.title || "Note";
        setToast({
          message: nextArchived ? `"${noteTitle}" archived` : `"${noteTitle}" unarchived`,
          type: "info",
          onUndo: async () => {
            await updateNote(noteId, { archived: !nextArchived });
            reset();
          },
        });
      } catch {
        reset();
      }
    });

  const handleRestoreNote = (noteId: number) =>
    run(noteId, async () => {
      try {
        await updateNote(noteId, { deletedAt: null });
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        setTotal((prev) => Math.max(0, prev - 1));
      } catch {
        reset();
      }
    });

  const handlePermanentDelete = (noteId: number) =>
    run(noteId, async () => {
      try {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        setTotal((prev) => Math.max(0, prev - 1));
        await permanentDeleteNote(noteId);
      } catch {
        reset();
      }
    });

  const handleEmptyTrash = () =>
    run("trash-all", async () => {
      try {
        await emptyTrash();
        setNotes([]);
        setTotal(0);
      } catch {
        reset();
      }
    });

  const handleToastUndo = async () => {
    if (!toast?.onUndo || undoingToast) return;
    setUndoingToast(true);
    try {
      await toast.onUndo();
    } catch {
      reset();
    } finally {
      setUndoingToast(false);
      setToast(null);
    }
  };

  const handleOpenModal = (note: NoteType) => {
    setSelectedNote(note);
    setModalOpen(true);
  };

  const handleNewNote = () => {
    setSelectedNote(null);
    setNewNoteKey((key) => key + 1);
    setModalOpen(true);
  };

  const handleNoteCreated = (note: NoteType) => {
    if (activeFilter === "all") {
      setNotes((prev) => [note, ...prev]);
      setTotal((prev) => prev + 1);
    }
    setModalOpen(false);
  };

  const handleNoteUpdated = (updated: NoteType) => {
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  };

  const handleNoteDeleted = (noteId: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    setTotal((prev) => Math.max(0, prev - 1));
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

  const openNote = (note: NoteType) =>
    reorderEnabled ? guardedOpen(note) : () => handleOpenModal(note);

  const cardFor = (note: NoteType) => (
    <NoteCard
      key={note.id}
      note={note}
      pending={isPending(note.id)}
      onClick={openNote(note)}
      onToggleFavorite={handleToggleFavorite}
      onDelete={handleDeleteNote}
      onArchive={handleArchiveNote}
      onRestore={handleRestoreNote}
      onPermanentDelete={handlePermanentDelete}
      filter={activeFilter}
    />
  );

  const listItemFor = (note: NoteType) => (
    <NoteListItem
      key={note.id}
      note={note}
      pending={isPending(note.id)}
      onClick={openNote(note)}
      onToggleFavorite={handleToggleFavorite}
      onDelete={handleDeleteNote}
      onArchive={handleArchiveNote}
      onRestore={handleRestoreNote}
      onPermanentDelete={handlePermanentDelete}
      filter={activeFilter}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar
        onNewNote={handleNewNote}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 min-w-0">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
          <header className="flex items-center gap-3 sm:gap-5 mb-6 sm:mb-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden shrink-0 w-10 h-10 -ml-1 rounded-lg flex items-center justify-center text-muted hover:text-foreground hover:bg-surface transition-colors"
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>

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
                  pr-4
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
                onClick={() => setGuideOpen(true)}
                className="text-muted hover:text-foreground transition-colors"
                aria-label="How it works"
                title="How it works"
              >
                <Info size={19} />
              </button>
              <button
                onClick={toggleTheme}
                className="text-muted hover:text-foreground transition-colors"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
              </button>
            </div>
          </header>

          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-[28px] font-semibold tracking-[-0.7px]">
                {pageTitle}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {total} notes
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

          {initialLoading ? (
            view === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                <NoteSkeleton variant="grid" count={8} />
              </div>
            ) : (
              <div className="space-y-2">
                <NoteSkeleton variant="list" count={8} />
              </div>
            )
          ) : error && notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={reset}
                className="text-sm text-primary hover:text-primary-hover transition-colors"
              >
                Try again
              </button>
            </div>
          ) : total === 0 ? (
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
                    onClick={() => setConfirmEmptyTrash(true)}
                    disabled={isPending("trash-all")}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-red-400 enabled:hover:text-red-300 enabled:hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Empty trash
                  </button>
                </div>
              )}

              {view === "grid" ? (
                reorderEnabled ? (
                  <Reorder.Group
                    as="div"
                    values={notes.map((n) => n.id)}
                    onReorder={handleReorder}
                    className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
                  >
                    {notes.map((note) => (
                      <DraggableNote
                        key={note.id}
                        id={note.id}
                        className="h-full [&>article]:h-full"
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                      >
                        {cardFor(note)}
                      </DraggableNote>
                    ))}
                  </Reorder.Group>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {notes.map(cardFor)}
                  </div>
                )
              ) : reorderEnabled ? (
                <Reorder.Group
                  as="div"
                  values={notes.map((n) => n.id)}
                  onReorder={handleReorder}
                  className="flex flex-col gap-2"
                >
                  {notes.map((note) => (
                    <DraggableNote
                      key={note.id}
                      id={note.id}
                      variant="list"
                      className="[&>article]:pl-9"
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    >
                      {listItemFor(note)}
                    </DraggableNote>
                  ))}
                </Reorder.Group>
              ) : (
                <div className="space-y-2">{notes.map(listItemFor)}</div>
              )}

              <div ref={sentryRef} className="h-px w-full" aria-hidden="true" />

              <NoteEndIndicator
                hasMore={hasMore}
                loadingMore={loadingMore}
                variant={view}
                error={error}
                onRetry={loadMore}
              />
            </>
          )}
        </div>
      </main>

      <NoteModal
        key={selectedNote?.id ?? `new-${newNoteKey}`}
        isOpen={modalOpen}
        note={selectedNote}
        onClose={() => setModalOpen(false)}
        onNoteCreated={handleNoteCreated}
        onNoteUpdated={handleNoteUpdated}
        onNoteDeleted={handleNoteDeleted}
        onArchive={handleArchiveNote}
      />

      <VoiceControl
        onActionDone={(note, action) => {
          if (action === "archive" && note) {
            setNotes((prev) => prev.filter((n) => n.id !== note.id));
            setTotal((prev) => Math.max(0, prev - 1));
            if (selectedNote?.id === note.id) {
              setModalOpen(false);
              setSelectedNote(null);
            }
            return;
          }
          if (note) {
            const exists = notes.some((n) => n.id === note.id);
            setNotes((prev) => {
              const found = prev.find((n) => n.id === note.id);
              if (found) {
                return prev.map((n) => (n.id === note.id ? note : n));
              }
              return [note, ...prev];
            });
            if (!exists) setTotal((prev) => prev + 1);
            setSelectedNote(note);
            setModalOpen(true);
          } else {
            reset();
          }
        }}
        onUndo={() => {
          setModalOpen(false);
          reset();
        }}
        onSearch={(query) => {
          setSearchQuery(query);
        }}
      />

      <VoiceGuideModal
        isOpen={guideIsOpen}
        onClose={handleGuideClose}
        showOnNextLogin={showOnNextLogin}
        onShowOnNextLoginChange={setGuideShowNextLogin}
      />

      <ConfirmModal
        isOpen={confirmEmptyTrash}
        title="Empty trash"
        message="Permanently delete all notes in Trash? This cannot be undone."
        confirmLabel="Empty trash"
        cancelLabel="Cancel"
        onConfirm={() => {
          setConfirmEmptyTrash(false);
          handleEmptyTrash();
        }}
        onCancel={() => setConfirmEmptyTrash(false)}
      />

      {toast && (
        <div className="fixed bottom-24 left-4 right-4 z-[100] sm:left-1/2 sm:right-auto sm:w-auto sm:max-w-md sm:-translate-x-1/2">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
            <Info size={16} className="mt-0.5 shrink-0 text-primary" />

            <span className="flex-1 text-sm font-medium leading-snug text-foreground">
              {toast.message}
            </span>

            {toast.onUndo && (
              <button
                onClick={handleToastUndo}
                disabled={undoingToast}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
              >
                <Undo2 size={13} />
                {undoingToast ? "Undoing…" : "Undo"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Note;
