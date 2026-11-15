import "express";
import type { Principal } from "../mcp/auth.js";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      mcpPrincipal?: Principal;
    }
  }
}
