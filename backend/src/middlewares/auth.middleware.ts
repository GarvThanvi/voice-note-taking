import type { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import jwt, { type JwtPayload } from "jsonwebtoken";

dotenv.config();

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token: string | undefined =
      req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!,
    ) as JwtPayload;

    req.userId = decoded.userId;
    next();
  } catch (error) {
    console.error("Error while verifying bearer token", error);
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
};
