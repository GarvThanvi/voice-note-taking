import * as z from "zod";

export const noteSchema = z.object({
  content: z.string().optional(),
  title: z.string().optional(),
  type: z.enum(["CHECKBOX", "PARAGRAPH"]),
  todos: z.array(z.string()).optional(),
});

export type NoteInput = z.infer<typeof noteSchema>;

export const todoUpdateSchema = z.object({
  id: z.number().optional(),
  text: z.string(),
  done: z.boolean().optional(),
});

export type TodoUpdateInput = z.infer<typeof todoUpdateSchema>;

export const completeTodoSchema = z.object({
  todoIds: z.array(z.number().int()).min(1, "At least one todo id is required"),
  done: z.boolean().optional(),
});

export type CompleteTodoInput = z.infer<typeof completeTodoSchema>;

export const updateNoteSchema = z.object({
  title: z.string().optional(),
  type: z.enum(["CHECKBOX", "PARAGRAPH"]).optional(),
  content: z.string().optional(),
  archived: z.boolean().optional(),
  deletedAt: z.string().nullable().optional(),
  bookmarked: z.boolean().optional(),
  todos: z.array(todoUpdateSchema).optional(),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const reorderNoteSchema = z.object({
  prevId: z.number().int().nullable().optional(),
  nextId: z.number().int().nullable().optional(),
});

export type ReorderNoteInput = z.infer<typeof reorderNoteSchema>;
