import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type VoiceAction =
  | "create_note"
  | "add_todo"
  | "mark_done"
  | "update_todo"
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

const SYSTEM_PROMPT = `You are a voice-command intent extractor for a notes & todo app.

Given a short spoken transcript, return a JSON object with exactly these fields:

{
  "action": one of "create_note" | "add_todo" | "mark_done" | "update_todo" | "archive" | "search",
  "note_hint": string | null — a fuzzy hint about WHICH note (e.g. "shopping list", "workout plan"),
  "todo_hint": string | null — a single fuzzy hint about a specific todo item (e.g. "olive oil"),
  "todo_items": string[] | null — multiple items for a new checklist (e.g. ["milk", "eggs", "bread"]),
  "content_paragraph": string | null — text content for a new paragraph note (e.g. "Discuss Q3 budget\nHire new dev"),
  "note_type_hint": "CHECKBOX" | "PARAGRAPH" | null — the note type the user implies,
  "updates": object | null — key/value pairs of what to update (e.g. {"title": "new title"}),
  "confidence": number between 0 and 1 — how confident you are in this interpretation
}

Rules:
- "create_note" means creating a brand new note:
  - If the user implies a CHECKBOX note (list, items, groceries, checklist, todo) → set note_type_hint to "CHECKBOX" and fill todo_items with the individual items mentioned. Each item should be a clean, short string.
  - If the user implies a PARAGRAPH note (meeting notes, journal, write, draft) → set note_type_hint to "PARAGRAPH" and fill content_paragraph with the text content.
  - Only fill ONE of todo_items or content_paragraph, never both.
  - If the user just says "create a note called X" without specifying items or content, set note_type_hint to "PARAGRAPH" and leave content_paragraph null.
- "add_todo" means adding a todo item to an EXISTING note (use todo_hint for the item text, note_hint for which note).
- "mark_done" means marking a todo as completed (use todo_hint for which item).
- "update_todo" means changing the text of an existing todo (use todo_hint for old text, updates.new_text for new).
- "archive" means archiving a note (use note_hint).
- "search" means searching notes/todos (use note_hint or todo_hint as the search query).
- If the transcript is ambiguous, lower the confidence score.
- Do NOT guess note IDs or todo IDs — you don't have access to the database.
- Return ONLY the JSON object, no markdown fences, no explanation.`;

export const extractIntent = async (transcript: string): Promise<VoiceIntent> => {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: transcript },
    ],
  });

  const raw = res.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("LLM returned empty response");
  }

  const parsed = JSON.parse(raw) as VoiceIntent;

  const validActions: VoiceAction[] = [
    "create_note",
    "add_todo",
    "mark_done",
    "update_todo",
    "archive",
    "search",
  ];
  if (!validActions.includes(parsed.action)) {
    parsed.action = "search";
    parsed.confidence = 0.2;
  }

  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));

  return parsed;
};
