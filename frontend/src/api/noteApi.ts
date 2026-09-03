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
  content: string;
  archived: boolean;
  bookmarked: boolean;
  createdAt: string;
  updatedAt: string;
  todos?: Todo[];
}

interface CreateNoteData {
  type: "PARAGRAPH" | "CHECKBOX";
  title?: string;
  content?: string;
  todos?: string[];
}

interface UpdateNoteData {
  type?: "PARAGRAPH" | "CHECKBOX";
  content?: string;
  archived?: boolean;
  bookmarked?: boolean;
  todos?: string[];
}

export const getNotes = async (bookmarked?: boolean): Promise<Note[]> => {
  const params = new URLSearchParams();
  if (bookmarked) {
    params.set("bookmarked", "true");
  }
  const queryString = params.toString();
  const url = `/note${queryString ? `?${queryString}` : ""}`;
  const response = await api.get(url);
  const data = response.data;
  if (!data.success) {
    throw new Error(data.message);
  }
  return Array.isArray(data.message) ? data.message : [];
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
