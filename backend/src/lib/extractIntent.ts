import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  note_type_hint: "CHECKBOX" | "PARAGRAPH" | null;
  updates: Record<string, string> | null;
  confidence: number;
}

// ---------------------------------------------------------------------------
// System prompt — constrains the LLM to a fixed, small action set.
// The LLM outputs *hints* (never DB IDs) because it doesn't know the data.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a voice-command intent extractor for a notes & todo app.

Given a short spoken transcript, return a JSON object with exactly these fields:

{
  "action": one of "create_note" | "add_todo" | "mark_done" | "update_todo" | "archive" | "search",
  "note_hint": string | null — a fuzzy hint about WHICH note (e.g. "shopping list", "workout plan"),
  "todo_hint": string | null — a fuzzy hint about WHICH todo item (e.g. "olive oil", "call dentist"),
  "note_type_hint": "CHECKBOX" | "PARAGRAPH" | null — only if the user clearly implies a checklist vs paragraph,
  "updates": object | null — key/value pairs of what to update (e.g. {"title": "new title"} for rename),
  "confidence": number between 0 and 1 — how confident you are in this interpretation
}

Rules:
- "add_todo" means adding a todo item to an existing note (use todo_hint for the item text, note_hint for which note).
- "create_note" means creating a brand new note.
- "mark_done" means marking a todo as completed (use todo_hint for which item).
- "update_todo" means changing the text of an existing todo (use todo_hint for old text, updates.new_text for new).
- "archive" means archiving a note (use note_hint).
- "search" means searching notes/todos (use note_hint or todo_hint as the search query).
- If the transcript is ambiguous, lower the confidence score.
- Do NOT guess note IDs or todo IDs — you don't have access to the database.
- Return ONLY the JSON object, no markdown fences, no explanation.`;

// ---------------------------------------------------------------------------
// extractIntent — sends the transcript to an LLM and returns a structured
// intent. Isolated so the LLM provider can be swapped later.
// ---------------------------------------------------------------------------

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

  // Validate the action field — fallback to search if the LLM returns garbage.
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

  // Clamp confidence to [0, 1].
  parsed.confidence = Math.max(0, Math.min(1, parsed.confidence ?? 0.5));

  return parsed;
};
