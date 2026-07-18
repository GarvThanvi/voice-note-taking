import express from "express";
import { prisma } from "./lib/prisma.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import "dotenv/config";
import {
  signupSchema,
  signinSchema,
  type SignupInput,
} from "./schemas/auth.js";
import {
  noteSchema,
  updateNoteSchema,
  type NoteInput,
  type UpdateNoteInput,
} from "./schemas/note.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { es } from "zod/locales";

const PORT = process.env.PORT;
const app = express();

app.use(express.json());

app.post("/api/auth/signup", async (req, res) => {
  try {
    const result: any = signupSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0].message,
      });
    }
    const userData: SignupInput = result.data;

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const newUser = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: userData.email },
      });
      if (existing) {
        throw new Error("USER_EXISTS");
      }

      return tx.user.create({
        data: {
          username: userData.username,
          email: userData.email,
          password: hashedPassword,
        },
      });
    });

    const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });
    res.json({
      success: true,
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_EXISTS") {
      return res.status(409).json({
        success: false,
        message: "User already exists, please sign in",
      });
    }
    console.error("Error occured while signing up user ", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

app.post("/api/auth/signin", async (req, res) => {
  try {
    const result = signinSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message,
      });
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    res.json({
      success: true,
      token,
      user: { id: user.id, username: user.username, email: user.email },
    });
  } catch (error) {
    console.error("Error occured while signing in user ", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

app.get("/api/note", authMiddleware, async (req, res) => {
  try {
    const userId: number = req.userId!;

    const notes = await prisma.note.findMany({
      where: { userId },
      include: { todos: true },
    });

    if (notes.length <= 0) {
      return res
        .status(200)
        .json({ success: true, message: "User does not have any notes" });
    }

    const formattedNotes = notes.map((note) => {
      if (note.type === "PARAGRAPH") {
        return {
          id: note.id,
          userId: note.userId,
          title: note.title,
          type: note.type,
          content: note.content,
          archived: note.archived,
          bookmarked: note.bookmarked,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        };
      }
      if (note.type === "CHECKBOX") {
        return {
          id: note.id,
          userId: note.userId,
          title: note.title,
          type: note.type,
          todos: note.todos,
          archived: note.archived,
          bookmarked: note.bookmarked,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        };
      }
    });

    return res.status(200).json({
      success: true,
      message: formattedNotes,
    });
  } catch (error) {
    console.error("Error while fetching all notes for a user ", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.post("/api/note", authMiddleware, async (req, res) => {
  try {
    const result = noteSchema.safeParse(req.body);
    const userId: number = req.userId!;
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message,
      });
    }

    const noteData: NoteInput = result.data;

    const newNote = await prisma.$transaction(async (tx) => {
      return tx.note.create({
        data: {
          content: noteData.content,
          userId: userId,
          title: noteData.title || "",
        },
      });
    });

    res.json({
      success: true,
      newNote,
    });
  } catch (error) {
    console.error("Error while creating a new note", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating note",
    });
  }
});

app.delete("/api/note/:noteId", authMiddleware, async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    const userId = req.userId!;

    if (isNaN(noteId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid note ID",
      });
    }

    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        userId,
      },
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

    await prisma.note.delete({
      where: {
        id: noteId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Note deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting note:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.put("/api/note/:noteId", authMiddleware, async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    const userId = req.userId!;

    if (isNaN(noteId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid note ID",
      });
    }

    const result = updateNoteSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { todos, ...fields } = result.data;
    const cleanFields = Object.fromEntries(
      Object.entries(fields).filter(([_, v]) => v !== undefined),
    );

    const updatedNote = await prisma.$transaction(async (tx) => {
      const existing = await tx.note.findFirst({
        where: { id: noteId, userId },
        include: { todos: true },
      });

      if (!existing) {
        throw new Error("NOTE_NOT_FOUND");
      }

      const updated = await tx.note.update({
        where: { id: noteId },
        data: cleanFields,
      });

      if (todos !== undefined) {
        await tx.todo.deleteMany({ where: { noteId } });
        if (todos.length > 0) {
          await tx.todo.createMany({
            data: todos.map((text, index) => ({
              noteId,
              text,
              order: index,
            })),
          });
        }
      }

      return tx.note.findUnique({
        where: { id: noteId },
        include: { todos: { orderBy: { order: "asc" } } },
      });
    });

    res.json({ success: true, note: updatedNote });
  } catch (error) {
    if (error instanceof Error && error.message === "NOTE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }
    console.error("Error updating note:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server started at port ${PORT}`);
});
