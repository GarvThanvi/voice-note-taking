import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  noteSchema,
  updateNoteSchema,
  reorderNoteSchema,
} from "../schemas/note.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res) => {
  const userId: number = req.userId!;
  const {
    bookmarked,
    search,
    archived,
    trashed,
    page: pageParam,
    limit: limitParam,
  } = req.query;

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
      {
        todos: {
          some: { text: { contains: search.trim(), mode: "insensitive" } },
        },
      },
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
});

router.post("/", async (req, res) => {
  const result = noteSchema.safeParse(req.body);
  const userId: number = req.userId!;
  if (!result.success) {
    return res.status(400).json({
      success: false,
      message: result.error.issues[0]?.message,
    });
  }

  const noteData = result.data;

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

  return res.json({
    success: true,
    newNote,
  });
});

router.delete("/:noteId", async (req, res) => {
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
});

router.put("/:noteId", async (req, res, next) => {
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

    return res.json({ success: true, note: updatedNote });
  } catch (error) {
    if (error instanceof Error && error.message === "NOTE_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Note not found",
      });
    }
    return next(error);
  }
});

router.put("/:noteId/order", async (req, res, next) => {
  try {
    const noteId = Number(req.params.noteId);
    const userId = req.userId!;

    if (isNaN(noteId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid note ID" });
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

    return res.json({ success: true, note: updated });
  } catch (error) {
    if (error instanceof Error && error.message === "NOTE_NOT_FOUND") {
      return res
        .status(404)
        .json({ success: false, message: "Note not found" });
    }
    if (error instanceof Error && error.message === "NEIGHBOR_NOT_FOUND") {
      return res
        .status(400)
        .json({ success: false, message: "Neighbor note not found" });
    }
    return next(error);
  }
});

router.put("/todo/complete/:noteId", async (req, res) => {
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

  return res.json({ success: true, note: updatedNote });
});

router.delete("/:noteId/permanent", async (req, res) => {
  const noteId = Number(req.params.noteId);
  const userId = req.userId!;

  if (isNaN(noteId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid note ID" });
  }

  const note = await prisma.note.findFirst({ where: { id: noteId, userId } });
  if (!note) {
    return res
      .status(404)
      .json({ success: false, message: "Note not found" });
  }

  await prisma.todo.deleteMany({ where: { noteId } });
  await prisma.note.delete({ where: { id: noteId } });

  return res
    .status(200)
    .json({ success: true, message: "Note permanently deleted" });
});

router.delete("/trash/empty", async (req, res) => {
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
    message: `Permanently deleted ${noteIds.length} note${
      noteIds.length !== 1 ? "s" : ""
    }`,
  });
});

export default router;
