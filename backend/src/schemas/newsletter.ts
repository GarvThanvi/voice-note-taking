import * as z from "zod";

export const newsletterSubscribeSchema = z.object({
  email: z.email("Please enter a valid email address"),
});

export type NewsletterSubscribeInput = z.infer<
  typeof newsletterSubscribeSchema
>;
