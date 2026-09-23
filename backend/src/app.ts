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
  reorderNoteSchema,
  type NoteInput,
  type UpdateNoteInput,
} from "./schemas/note.js";
import { authMiddleware } from "./middlewares/auth.middleware.js";
import { set } from "zod";
import cors from "cors";
import { googleClient } from "./config/google.js";
import { google } from "googleapis";
import voiceRoutes from "./routes/voice.js";
import voiceUndoRoutes from "./routes/voiceUndo.js";
import passwordResetRoutes from "./routes/passwordReset.js";
import guideRoutes from "./routes/guide.js";
import newsletterRoutes from "./routes/newsletter.js";

const PORT = process.env.PORT || 8080;
const app = express();

app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL }));

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

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
        hasSeenGuide: newUser.hasSeenGuide,
        showGuideOnLogin: newUser.showGuideOnLogin,
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
    
    if(user.googleId && !user.password){
      return res.status(401).json({success: false, message: "This account was signed up with Google"})
    }

    const passwordMatch = await bcrypt.compare(password, user.password!);
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
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
        hasSeenGuide: user.hasSeenGuide,
        showGuideOnLogin: user.showGuideOnLogin,
      },
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

app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const userId: number = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        profilePicture: true,
        hasSeenGuide: true,
        showGuideOnLogin: true,
      },
    });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Error while fetching the user", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.get("/api/note", authMiddleware, async (req, res) => {
  try {
    const userId: number = req.userId!;
    const { bookmarked, search, archived, trashed, page: pageParam, limit: limitParam } = req.query;

    const page = Math.max(1, Number(pageParam) || 1);
    const limit = Math.min(50, Math.max(1, Number(limitParam) || 12));
    const skip = (page - 1) * limit;

    const where: any = { userId };

    if (trashed === "true") {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }

    if (archived === "true") {
      where.archived = true;
    } else if (trashed !== "true") {
      where.archived = false;
    }

    if (bookmarked === "true") {
      where.bookmarked = true;
    }
    if (typeof search === "string" && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: "insensitive" } },
        { content: { contains: search.trim(), mode: "insensitive" } },
        { todos: { some: { text: { contains: search.trim(), mode: "insensitive" } } } },
      ];
    }

    const [notes, total] = await Promise.all([
      prisma.note.findMany({
        where,
        include: { todos: { orderBy: { order: "asc" } } },
        orderBy: [{ order: "asc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.note.count({ where }),
    ]);

    const formattedNotes = notes.map((note) => {
      if (note.type === "PARAGRAPH") {
        return {
          id: note.id,
          userId: note.userId,
          title: note.title,
          type: note.type,
          content: note.content,
          archived: note.archived,
          deletedAt: note.deletedAt,
          bookmarked: note.bookmarked,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          order: note.order,
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
          deletedAt: note.deletedAt,
          bookmarked: note.bookmarked,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          order: note.order,
        };
      }
    });

    return res.status(200).json({
      success: true,
      message: {
        notes: formattedNotes,
        total,
        page,
        hasMore: page * limit < total,
      },
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
      const minOrder = await tx.note.aggregate({
        where: { userId },
        _min: { order: true },
      });
      const nextOrder = (minOrder._min.order ?? 0) - 1;

      if (noteData.type === "PARAGRAPH") {
        return tx.note.create({
          data: {
            type: "PARAGRAPH",
            content: noteData.content!,
            userId,
            title: noteData.title || "",
            order: nextOrder,
          },
        });
      }

      if (noteData.type === "CHECKBOX") {
        const note = await tx.note.create({
          data: {
            type: "CHECKBOX",
            userId,
            title: noteData.title || "",
            content: "",
            order: nextOrder,
          },
        });

        if (noteData.todos && noteData.todos.length > 0) {
          await tx.todo.createMany({
            data: noteData.todos.map((text, index) => ({
              noteId: note.id,
              text,
              order: index,
            })),
          });
        }

        return tx.note.findUnique({
          where: { id: note.id },
          include: {
            todos: {
              orderBy: {
                order: "asc",
              },
            },
          },
        });
      }

      throw new Error("INVALID_NOTE_TYPE");
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

    await prisma.note.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });

    return res.status(200).json({
      success: true,
      message: "Note moved to trash",
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
        const existingTodos = await tx.todo.findMany({
          where: { noteId },
          orderBy: { order: "asc" },
        });

        const incomingIds = todos
          .map((todo) => todo.id)
          .filter((id): id is number => id !== undefined);

        const idsToDelete = existingTodos
          .filter((todo) => !incomingIds.includes(todo.id))
          .map((todo) => todo.id);

        if (idsToDelete.length > 0) {
          await tx.todo.deleteMany({ where: { id: { in: idsToDelete } } });
        }

        for (let index = 0; index < todos.length; index++) {
          const todo = todos[index]!;
          const done = todo.done ?? false;

          if (todo.id !== undefined) {
            await tx.todo.updateMany({
              where: { id: todo.id, noteId },
              data: { text: todo.text, done, order: index },
            });
          } else {
            await tx.todo.create({
              data: { noteId, text: todo.text, done, order: index },
            });
          }
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

app.put("/api/note/:noteId/order", authMiddleware, async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    const userId = req.userId!;

    if (isNaN(noteId)) {
      return res.status(400).json({ success: false, message: "Invalid note ID" });
    }

    const result = reorderNoteSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { prevId, nextId } = result.data;

    const updated = await prisma.$transaction(async (tx) => {
      const note = await tx.note.findFirst({ where: { id: noteId, userId } });
      if (!note) throw new Error("NOTE_NOT_FOUND");

      const resolveNeighbor = async (id: number | null | undefined) => {
        if (id === null || id === undefined) return null;
        const neighbor = await tx.note.findFirst({
          where: { id, userId },
          select: { order: true },
        });
        if (!neighbor) throw new Error("NEIGHBOR_NOT_FOUND");
        return neighbor.order;
      };

      let prevOrder = await resolveNeighbor(prevId);
      let nextOrder = await resolveNeighbor(nextId);

      const gapCollapsed =
        prevOrder !== null && nextOrder !== null && nextOrder - prevOrder < 1e-9;

      if (gapCollapsed) {
        const allNotes = await tx.note.findMany({
          where: { userId },
          orderBy: [{ order: "asc" }, { id: "desc" }],
          select: { id: true },
        });
        for (let index = 0; index < allNotes.length; index++) {
          await tx.note.update({
            where: { id: allNotes[index]!.id },
            data: { order: index },
          });
        }
        prevOrder = await resolveNeighbor(prevId);
        nextOrder = await resolveNeighbor(nextId);
      }

      let newOrder: number;
      if (prevOrder === null && nextOrder === null) {
        newOrder = 0;
      } else if (prevOrder === null) {
        newOrder = nextOrder! - 1;
      } else if (nextOrder === null) {
        const maxOrder = await tx.note.aggregate({
          where: { userId },
          _max: { order: true },
        });
        newOrder = (maxOrder._max.order ?? 0) + 1;
      } else {
        newOrder = (prevOrder + nextOrder) / 2;
      }

      return tx.note.update({
        where: { id: noteId },
        data: { order: newOrder },
        include: { todos: { orderBy: { order: "asc" } } },
      });
    });

    res.json({ success: true, note: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "NOTE_NOT_FOUND") {
      return res.status(404).json({ success: false, message: "Note not found" });
    }
    if (error instanceof Error && error.message === "NEIGHBOR_NOT_FOUND") {
      return res.status(400).json({ success: false, message: "Neighbor note not found" });
    }
    console.error("Error reordering note:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.put("/api/note/todo/complete/:noteId", authMiddleware, async (req, res) => {
  try {
    const { todoIds, done } = req.body;
    const noteId = Number(req.params.noteId);
    const userId = req.userId!;
    const setDone = done !== undefined ? done : true;

    if (isNaN(noteId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid note ID",
      });
    }

    if (
      !Array.isArray(todoIds) ||
      todoIds.some((id) => typeof id !== "number" || isNaN(id))
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid todoIds: must be an array of number",
      });
    }

    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        userId,
      },
      include: { todos: true },
    });

    if (!note) {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }

    const existingTodos = await prisma.todo.findMany({
      where: {
        noteId,
        id: { in: todoIds },
      },
    });

    if (existingTodos.length !== todoIds.length) {
      return res.status(400).json({
        success: false,
        message: `Some todoIds do not belong to this note`,
      });
    }

    await prisma.todo.updateMany({
      where: {
        noteId,
        id: { in: todoIds },
      },
      data: {
        done: setDone,
      },
    });

    const updatedNote = await prisma.note.findUnique({
      where: { id: noteId },
      include: { todos: { orderBy: { order: "asc" } } },
    });

    res.json({ success: true, note: updatedNote });
  } catch (error) {
    console.error("Error updating todos:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

app.delete("/api/note/:noteId/permanent", authMiddleware, async (req, res) => {
  try {
    const noteId = Number(req.params.noteId);
    const userId = req.userId!;

    if (isNaN(noteId)) {
      return res.status(400).json({ success: false, message: "Invalid note ID" });
    }

    const note = await prisma.note.findFirst({ where: { id: noteId, userId } });
    if (!note) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }

    await prisma.todo.deleteMany({ where: { noteId } });
    await prisma.note.delete({ where: { id: noteId } });

    return res.status(200).json({ success: true, message: "Note permanently deleted" });
  } catch (error) {
    console.error("Error permanently deleting note:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.delete("/api/note/trash/empty", authMiddleware, async (req, res) => {
  try {
    const userId: number = req.userId!;

    const trashedNotes = await prisma.note.findMany({
      where: { userId, deletedAt: { not: null } },
      select: { id: true },
    });

    const noteIds = trashedNotes.map((n) => n.id);

    if (noteIds.length > 0) {
      await prisma.todo.deleteMany({ where: { noteId: { in: noteIds } } });
      await prisma.note.deleteMany({ where: { id: { in: noteIds } } });
    }

    return res.status(200).json({
      success: true,
      message: `Permanently deleted ${noteIds.length} note${noteIds.length !== 1 ? "s" : ""}`,
    });
  } catch (error) {
    console.error("Error emptying trash:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

//google auth routes

const googleScopes = ["openid", "profile", "email"];

app.get("/api/auth/google", (req, res) => {
  const url = googleClient.generateAuthUrl({
    access_type: "offline",
    scope: googleScopes,
    prompt: "select_account",
  });

  res.redirect(url);
});

app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Authorization code missing",
      });
    }
    const { tokens } = await googleClient.getToken(code as string);

    googleClient.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: googleClient,
      version: "v2",
    });

    const { data } = await oauth2.userinfo.get();

    const user = await prisma.user.findUnique({
      where: { email: data.email! },
    });
    if (!user) {
      const newUser = await prisma.$transaction(async (tx) => {
        return tx.user.create({
          data: {
            username: data.name!,
            email: data.email!,
            profilePicture: data.picture!,
            googleId: data.id!,
          },
        });
      });

      const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET!, {
        expiresIn: "7d",
      });
      return res.redirect(
        `${process.env.FRONTEND_URL}/auth/google-success?token=${token}`,
      );
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: "7d",
    });

    let updatedUser = user;

    if (!user.profilePicture || !user.googleId) {
      updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          ...(user.profilePicture ? {} : { profilePicture: data.picture! }),
          ...(user.googleId ? {} : { googleId: data.id! }),
        },
      });
    }

    return res.redirect(
      `${process.env.FRONTEND_URL}/auth/google-success?token=${token}`,
    );
  } catch (error) {
    console.error("Error in google callback route", error);

    return res.redirect(
      `${process.env.FRONTEND_URL}/signin?error=google_auth_failed`,
    );
  }
});

app.use("/api/auth", passwordResetRoutes);
app.use("/api/auth", guideRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/voice", voiceUndoRoutes);

app.listen(PORT, () => {
  console.log(`Server started at port ${PORT}`);
});
