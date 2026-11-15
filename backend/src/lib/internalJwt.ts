import jwt from "jsonwebtoken";

export const signInternalToken = (userId: number): string =>
  jwt.sign({ userId, internal: true }, process.env.JWT_SECRET!, {
    expiresIn: "5m",
  });
