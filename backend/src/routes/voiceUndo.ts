import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { consumeUndoToken } from "../lib/undoStore.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

/**
 * POST /api/voice/undo
 *
 * Reverts the last voice action for a given undo token.
 * Tokens expire after 5 minutes and are single-use.
 */
router.post("/undo", authMiddleware, async (req, res) => {
  try {
    const userId: number = req.userId!;
    const { undoToken } = req.body;

    if (!undoToken || typeof undoToken !== "string") {
      return res.status(400).json({
        success: false,
        message: "undoToken is required.",
      });
    }

    const entry = consumeUndoToken(undoToken);

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Undo token expired or already used.",
      });
    }

    if (entry.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "This undo token does not belong to you.",
      });
    }

    switch (entry.action) {
      case "create_note": {
        const { noteId } = entry.payload as { noteId: number };
        // Delete the note and its todos.
        await prisma.todo.deleteMany({ where: { noteId } });
        await prisma.note.delete({ where: { id: noteId } });
        break;
      }

      case "add_todo": {
        const { todoId } = entry.payload as { todoId: number };
        await prisma.todo.delete({ where: { id: todoId } });
        break;
      }

      default:
        return res.status(400).json({
          success: false,
          message: `Undo not implemented for action "${entry.action}".`,
        });
    }

    return res.status(200).json({
      success: true,
      message: `Undid: ${entry.action}`,
    });
  } catch (error) {
    console.error("Undo error:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
