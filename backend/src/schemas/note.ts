import * as z from "zod";

export const appendTodosSchema = z.object({
  items: z.array(z.string().trim().min(1).max(500)).min(1).max(50),
});

export type AppendTodosInput = z.infer<typeof appendTodosSchema>;

export const singleTodoUpdateSchema = z
  .object({
    text: z.string().min(1).optional(),
    done: z.boolean().optional(),
  })
  .refine((data) => data.text !== undefined || data.done !== undefined, {
    message: "Provide text or done",
  });

export type SingleTodoUpdateInput = z.infer<typeof singleTodoUpdateSchema>;

export const noteSchema = z.object({
  content: z.string().optional(),
  title: z.string().optional(),
  type: z.enum(["CHECKBOX", "PARAGRAPH"]),
  todos: z.array(z.string()).optional(),
  labelIds: z.array(z.number().int().positive()).max(20).optional(),
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
  labelIds: z.array(z.number().int().positive()).max(20).optional(),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const reorderNoteSchema = z.object({
  prevId: z.number().int().nullable().optional(),
  nextId: z.number().int().nullable().optional(),
});

export type ReorderNoteInput = z.infer<typeof reorderNoteSchema>;
