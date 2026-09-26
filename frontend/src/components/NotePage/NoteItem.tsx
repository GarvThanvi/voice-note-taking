import NoteCard from "./NoteCard";
import NoteListItem from "./NoteListItem";
import type { Note } from "../../api/noteApi";

interface NoteItemProps {
  view: "grid" | "list";
  note: Note;
  pending: boolean;
  onClick: () => void;
  onToggleFavorite: (noteId: number, bookmarked: boolean) => void;
  onDelete: (noteId: number) => void;
  onArchive?: (noteId: number) => void;
  onRestore?: (noteId: number) => void;
  onPermanentDelete?: (noteId: number) => void;
  filter?: string;
}

const NoteItem = ({ view, ...props }: NoteItemProps) =>
  view === "grid" ? <NoteCard {...props} /> : <NoteListItem {...props} />;

export default NoteItem;
