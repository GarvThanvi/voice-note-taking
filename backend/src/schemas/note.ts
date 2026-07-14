import * as z from "zod";

export const noteSchema = z.object({
  content: z.string(),
  title: z.string().optional()
});

export type NoteInput = z.infer<typeof noteSchema>;
