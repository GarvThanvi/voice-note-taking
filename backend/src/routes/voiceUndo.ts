import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { consumeUndoToken } from "../lib/undoStore.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

router.post("/undo", authMiddleware, async (req, res) => {
  try {
    const userId: number = req.userId!;
    const { undoToken } = req.body;

    if (!undoToken || typeof undoToken !== "string") {
      return res.status(400).json({ success: false, message: "undoToken is required." });
    }

    const entry = consumeUndoToken(undoToken);

    if (!entry) {
      return res.status(404).json({ success: false, message: "Undo token expired or already used." });
    }

    if (entry.userId !== userId) {
      return res.status(403).json({ success: false, message: "This undo token does not belong to you." });
    }

    switch (entry.action) {
      case "create_note": {
        const { noteId } = entry.payload as { noteId: number };
        await prisma.todo.deleteMany({ where: { noteId } });
        await prisma.note.delete({ where: { id: noteId } });
        break;
      }

      case "add_todo": {
        const { todoId, noteId, previousContent, type } = entry.payload as {
          todoId?: number;
          noteId: number;
          previousContent?: string;
          type?: string;
        };

        if (type === "paragraph") {
          await prisma.note.update({
            where: { id: noteId },
            data: { content: previousContent ?? "" },
          });
        } else if (todoId) {
          await prisma.todo.delete({ where: { id: todoId } });
        }
        break;
      }

      case "mark_done": {
        const { todoId, previousDone } = entry.payload as {
          todoId: number;
          previousDone: boolean;
        };
        await prisma.todo.update({
          where: { id: todoId },
          data: { done: previousDone },
        });
        break;
      }

      case "update_todo": {
        const { todoId, previousText } = entry.payload as {
          todoId: number;
          previousText: string;
        };
        await prisma.todo.update({
          where: { id: todoId },
          data: { text: previousText },
        });
        break;
      }

      case "update_note": {
        const { noteId, previousContent } = entry.payload as {
          noteId: number;
          previousContent: string;
        };
        await prisma.note.update({
          where: { id: noteId },
          data: { content: previousContent ?? "" },
        });
        break;
      }

      case "archive": {
        const { noteId, previousArchived } = entry.payload as {
          noteId: number;
          previousArchived: boolean;
        };
        await prisma.note.update({
          where: { id: noteId },
          data: { archived: previousArchived ?? false },
        });
        break;
      }

      default:
        return res.status(400).json({
          success: false,
          message: `Undo not implemented for action "${entry.action}".`,
        });
    }

    return res.status(200).json({ success: true, message: `Undid: ${entry.action}` });
  } catch (error) {
    console.error("Undo error:", error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
