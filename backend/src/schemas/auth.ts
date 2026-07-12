import * as z from "zod";

export const signupSchema = z.object({
  username: z
    .string()
    .min(3, "Username must be atleast 3 characters")
    .max(30, "Username cannot be more than 30 characters"),
  email: z.email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(20, "Password must be at most 20 characters.")
    .refine((v) => /^\S+$/.test(v), "Password must not contain spaces.")
    .refine(
      (v) => /[a-z]/.test(v),
      "Must include at least one lowercase letter.",
    )
    .refine(
      (v) => /[A-Z]/.test(v),
      "Must include at least one uppercase letter.",
    )
    .refine((v) => /\d/.test(v), "Must include at least one number.")
    .refine(
      (v) => /[^\w\s]/.test(v),
      "Must include at least one special character.",
    ),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const signinSchema = z.object({
  email: z.email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(20, "Password must be at most 20 characters.")
    .refine((v) => /^\S+$/.test(v), "Password must not contain spaces.")
    .refine(
      (v) => /[a-z]/.test(v),
      "Must include at least one lowercase letter.",
    )
    .refine(
      (v) => /[A-Z]/.test(v),
      "Must include at least one uppercase letter.",
    )
    .refine((v) => /\d/.test(v), "Must include at least one number.")
    .refine(
      (v) => /[^\w\s]/.test(v),
      "Must include at least one special character.",
    ),
});

export type SigninInput = z.infer<typeof signinSchema>;
