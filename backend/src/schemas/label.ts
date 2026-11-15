import * as z from "zod";

export const labelColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value like #FF4058")
  .transform((color) => color.toUpperCase());

export const labelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Label name is required")
    .max(30, "Label name must be 30 characters or fewer"),
  color: labelColorSchema,
});

export const updateLabelSchema = labelSchema.partial();

export type LabelInput = z.infer<typeof labelSchema>;
export type UpdateLabelInput = z.infer<typeof updateLabelSchema>;
