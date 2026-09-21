import api from "./axiosInstance";

export interface Todo {
  id: number;
  noteId: number;
  text: string;
  done: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: number;
  userId: number;
  title: string | null;
  type: "PARAGRAPH" | "CHECKBOX";
  content?: string;
  archived: boolean;
  deletedAt?: string | null;
  bookmarked: boolean;
  createdAt: string;
  updatedAt: string;
  order: number;
  todos?: Todo[];
}

export interface PaginatedNotes {
  notes: Note[];
  total: number;
  page: number;
  hasMore: boolean;
}

interface CreateNoteData {
  type: "PARAGRAPH" | "CHECKBOX";
  title?: string;
  content?: string;
  todos?: string[];
}

interface TodoUpdateData {
  id?: number;
  text: string;
  done: boolean;
}

interface UpdateNoteData {
  title?: string;
  type?: "PARAGRAPH" | "CHECKBOX";
  content?: string;
  archived?: boolean;
  deletedAt?: string | null;
  bookmarked?: boolean;
  todos?: TodoUpdateData[];
}

export const getNotes = async (
  options?: {
    bookmarked?: boolean;
    search?: string;
    archived?: boolean;
    trashed?: boolean;
    page?: number;
    limit?: number;
  }
): Promise<PaginatedNotes> => {
  const params = new URLSearchParams();
  if (options?.bookmarked) params.set("bookmarked", "true");
  if (options?.search) params.set("search", options.search);
  if (options?.archived) params.set("archived", "true");
  if (options?.trashed) params.set("trashed", "true");
  params.set("page", String(options?.page ?? 1));
  params.set("limit", String(options?.limit ?? 12));
  const queryString = params.toString();
  const url = `/note${queryString ? `?${queryString}` : ""}`;
  const response = await api.get(url);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  const message = data.message;
  if (message && Array.isArray(message.notes)) {
    return {
      notes: message.notes,
      total: typeof message.total === "number" ? message.total : message.notes.length,
      page: typeof message.page === "number" ? message.page : 1,
      hasMore: Boolean(message.hasMore),
    };
  }
  return { notes: [], total: 0, page: 1, hasMore: false };
};

export const createNote = async (noteData: CreateNoteData): Promise<Note> => {
  const response = await api.post("/note", noteData);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return data.newNote;
};

export const updateNote = async (
  noteId: number,
  noteData: UpdateNoteData
): Promise<Note> => {
  const response = await api.put(`/note/${noteId}`, noteData);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return data.note;
};

export const deleteNote = async (noteId: number): Promise<void> => {
  const response = await api.delete(`/note/${noteId}`);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
};

export const permanentDeleteNote = async (noteId: number): Promise<void> => {
  const response = await api.delete(`/note/${noteId}/permanent`);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
};

export const reorderNote = async (
  noteId: number,
  prevId: number | null,
  nextId: number | null
): Promise<Note> => {
  const response = await api.put(`/note/${noteId}/order`, { prevId, nextId });
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return data.note;
};

export const emptyTrash = async (): Promise<void> => {
  const response = await api.delete("/note/trash/empty");
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
};

export const toggleTodoComplete = async (
  noteId: number,
  todoIds: number[],
  done: boolean
): Promise<Note> => {
  const response = await api.put(`/note/todo/complete/${noteId}`, { todoIds, done });
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return data.note;
};
