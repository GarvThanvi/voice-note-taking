import api from "./axiosInstance";
import type { Note } from "./noteApi";

export type VoiceAction =
  | "create_note"
  | "add_todo"
  | "mark_done"
  | "update_todo"
  | "update_note"
  | "archive"
  | "search";

export interface VoiceIntent {
  action: VoiceAction;
  note_hint: string | null;
  todo_hint: string | null;
  todo_items: string[] | null;
  content_paragraph: string | null;
  note_type_hint: "CHECKBOX" | "PARAGRAPH" | null;
  updates: Record<string, string> | null;
  confidence: number;
}

export interface ResolvedTarget {
  noteId: number;
  title: string | null;
  todoId: number | null;
  todoText: string | null;
  noteScore: number;
  todoScore: number;
  combinedScore: number;
}

export type ResolutionResult =
  | { status: "found"; target: ResolvedTarget }
  | { status: "ambiguous"; candidates: ResolvedTarget[] }
  | { status: "not_found" };

export interface ExecutionResult {
  status: "done" | "ambiguous" | "not_found";
  action: string;
  noteId?: number;
  todoId?: number;
  summary: string;
  undoToken?: string;
  candidates?: ResolvedTarget[];
  note?: Note;
}

export interface VoiceCommandResponse {
  success: boolean;
  transcript?: string;
  intent?: VoiceIntent | null;
  resolution?: ResolutionResult | null;
  execution?: ExecutionResult | null;
  userId?: number;
  message?: string;
}

export const sendVoiceCommand = async (
  audioBlob: Blob
): Promise<VoiceCommandResponse> => {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const response = await api.post<VoiceCommandResponse>(
    "/voice/command",
    formData,
    {
      headers: { "Content-Type": undefined },
    }
  );

  return response.data;
};

export const undoVoiceAction = async (
  undoToken: string
): Promise<{ success: boolean; message: string }> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/voice/undo",
    { undoToken }
  );
  return response.data;
};
