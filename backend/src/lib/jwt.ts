import jwt from "jsonwebtoken";

export const signToken = (userId: number): string =>
  jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "7d" });
