import { Search, Moon, Sun, Grid2X2, List, Info, Menu, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { Reorder } from "framer-motion";
import Sidebar from "../components/NotePage/Sidebar";
import NoteItem from "../components/NotePage/NoteItem";
import DraggableNote from "../components/NotePage/DraggableNote";
import NoteToast from "../components/NotePage/NoteToast";
import { getPageTitle, getEmptyMessage } from "../components/NotePage/notesMeta";
import NoteModal from "../components/NotePage/NoteModal";
import LabelModal from "../components/NotePage/LabelModal";
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
import { useLabels } from "../hooks/useLabels";
import { labelFilterValue, hasLabel, parseLabelFilter } from "../lib/labelStyle";
import type { Note as NoteType } from "../api/noteApi";
import type { Label } from "../api/labelApi";

const Note = () => {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
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
  const [labelDialog, setLabelDialog] = useState<{ open: boolean; label: Label | null }>({
    open: false,
    label: null,
  });

  const {
    labels,
    create: createLabelMutation,
    update: updateLabelMutation,
    remove: removeLabelMutation,
    refresh: refreshLabels,
  } = useLabels();

  const labelId = parseLabelFilter(activeFilter);

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

  const sameLabelIds = (a: { id: number }[] | undefined, b: { id: number }[] | undefined) => {
    const left = a ?? [];
    const right = b ?? [];
    return left.length === right.length && left.every((label) => right.some((other) => other.id === label.id));
  };

  const handleDeleteNote = (noteId: number) =>
    run(noteId, async () => {
      try {
        const noteTitle = notes.find((n) => n.id === noteId)?.title || "Note";
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        setTotal((prev) => Math.max(0, prev - 1));
        await updateNote(noteId, { deletedAt: new Date().toISOString(), archived: false });
        void refreshLabels();
        setToast({
          message: `"${noteTitle}" moved to trash`,
          type: "info",
          onUndo: async () => {
            await updateNote(noteId, { deletedAt: null });
            void refreshLabels();
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
        void refreshLabels();
        const noteTitle = note.title || "Note";
        setToast({
          message: nextArchived ? `"${noteTitle}" archived` : `"${noteTitle}" unarchived`,
          type: "info",
          onUndo: async () => {
            await updateNote(noteId, { archived: !nextArchived });
            void refreshLabels();
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
        void refreshLabels();
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
        void refreshLabels();
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
        void refreshLabels();
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
    const matchesLabel = labelId !== undefined && hasLabel(note.labels, labelId);
    if (activeFilter === "all" || matchesLabel) {
      setNotes((prev) => [note, ...prev]);
      setTotal((prev) => prev + 1);
    }
    void refreshLabels();
    setModalOpen(false);
  };

  const handleNoteUpdated = (updated: NoteType) => {
    const previous = notes.find((n) => n.id === updated.id);
    const matchesLabel = labelId !== undefined && hasLabel(updated.labels, labelId);

    if (labelId !== undefined && !matchesLabel) {
      if (previous) {
        setNotes((prev) => prev.filter((n) => n.id !== updated.id));
        setTotal((prev) => Math.max(0, prev - 1));
      }
    } else {
      setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
    }

    if (!previous || !sameLabelIds(previous.labels, updated.labels)) {
      void refreshLabels();
    }
  };

  const handleNoteDeleted = (noteId: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    setTotal((prev) => Math.max(0, prev - 1));
    void refreshLabels();
    setModalOpen(false);
  };

  const patchNoteLabels = (
    id: number,
    next: { name: string; color: string } | null
  ) => {
    setNotes((prev) =>
      prev.map((note) => ({
        ...note,
        labels: next
          ? note.labels.map((label) => (label.id === id ? { ...label, ...next } : label))
          : note.labels.filter((label) => label.id !== id),
      }))
    );
  };

  const handleLabelSubmit = async (data: { name: string; color: string }) => {
    if (labelDialog.label) {
      const updated = await updateLabelMutation(labelDialog.label.id, data);
      patchNoteLabels(updated.id, { name: updated.name, color: updated.color });
    } else {
      await createLabelMutation(data);
    }
  };

  const handleLabelDelete = async () => {
    const target = labelDialog.label;
    if (!target) return;
    await removeLabelMutation(target.id);
    patchNoteLabels(target.id, null);
    if (activeFilter === labelFilterValue(target.id)) {
      setActiveFilter("all");
    }
  };

  const pageTitle =
    labelId !== undefined
      ? labels.find((label) => label.id === labelId)?.name ?? "Label"
      : getPageTitle(activeFilter);

  const openNote = (note: NoteType) =>
    reorderEnabled ? guardedOpen(note) : () => handleOpenModal(note);

  const renderItem = (note: NoteType) => (
    <NoteItem
      key={note.id}
      view={view}
      note={note}
      pending={isPending(note.id)}
      onClick={openNote(note)}
      onToggleFavorite={handleToggleFavorite}
      onDelete={handleDeleteNote}
      onArchive={handleArchiveNote}
      onRestore={handleRestoreNote}
      onPermanentDelete={handlePermanentDelete}
      onLabelClick={(label) => setActiveFilter(labelFilterValue(label.id))}
      filter={activeFilter}
    />
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar
        onNewNote={handleNewNote}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        labels={labels}
        onNewLabel={() => setLabelDialog({ open: true, label: null })}
        onEditLabel={(label) => setLabelDialog({ open: true, label })}
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
              <button
                onClick={() => navigate("/settings")}
                className="text-muted hover:text-foreground transition-colors"
                aria-label="Settings"
                title="Settings"
              >
                <Settings size={19} />
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
                {labelId !== undefined && !debouncedSearch
                  ? "No notes with this label"
                  : getEmptyMessage(activeFilter)}
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
                        {renderItem(note)}
                      </DraggableNote>
                    ))}
                  </Reorder.Group>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {notes.map(renderItem)}
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
                      {renderItem(note)}
                    </DraggableNote>
                  ))}
                </Reorder.Group>
              ) : (
                <div className="space-y-2">{notes.map(renderItem)}</div>
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
        labels={labels}
        onCreateLabel={createLabelMutation}
        defaultLabelIds={labelId !== undefined ? [labelId] : []}
        onClose={() => setModalOpen(false)}
        onNoteCreated={handleNoteCreated}
        onNoteUpdated={handleNoteUpdated}
        onNoteDeleted={handleNoteDeleted}
        onArchive={handleArchiveNote}
      />

      {labelDialog.open && (
        <LabelModal
          isOpen
          label={labelDialog.label}
          onClose={() => setLabelDialog({ open: false, label: null })}
          onSubmit={handleLabelSubmit}
          onDelete={labelDialog.label ? handleLabelDelete : undefined}
        />
      )}

      <VoiceControl
        onActionDone={(note, action) => {
          void refreshLabels();

          if (labelId !== undefined) {
            setModalOpen(false);
            setSelectedNote(null);
            reset();
            return;
          }

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
          void refreshLabels();
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
        <NoteToast
          message={toast.message}
          undoable={Boolean(toast.onUndo)}
          undoing={undoingToast}
          onUndo={handleToastUndo}
        />
      )}
    </div>
  );
};

export default Note;
