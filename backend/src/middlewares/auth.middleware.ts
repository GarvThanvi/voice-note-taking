import type { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { decode } from "node:punycode";
dotenv.config();

interface AuthRequest extends Request {
  userId?: number;
}

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token: string = req.headers.authorization?.split(" ")[1]!;
    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const decoded: JwtPayload = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as JwtPayload;

    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error("Error while verifying bearer token", error);
    return res.status(500).json({ success: false, message: "Bad Request" });
  }
};
