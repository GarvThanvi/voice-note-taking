import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { labelSchema, updateLabelSchema } from "../schemas/label.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

const labelInclude = {
  _count: {
    select: {
      notes: { where: { deletedAt: null, archived: false } },
    },
  },
} as const;

interface LabelWithCount {
  id: number;
  name: string;
  color: string;
  _count: { notes: number };
}

const toLabelDto = (label: LabelWithCount) => ({
  id: label.id,
  name: label.name,
  color: label.color,
  noteCount: label._count.notes,
});

const findDuplicate = (userId: number, name: string, excludeId?: number) =>
  prisma.label.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

router.get("/", async (req, res, next) => {
  try {
    const userId: number = req.userId!;

    const labels = await prisma.label.findMany({
      where: { userId },
      include: labelInclude,
      orderBy: { name: "asc" },
    });

    return res.status(200).json({
      success: true,
      labels: labels.map(toLabelDto),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const userId: number = req.userId!;

    const result = labelSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const duplicate = await findDuplicate(userId, result.data.name);
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "A label with that name already exists",
      });
    }

    const created = await prisma.label.create({
      data: { ...result.data, userId },
      include: labelInclude,
    });

    return res.status(201).json({
      success: true,
      label: toLabelDto(created),
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const userId: number = req.userId!;
    const labelId = Number(req.params.id);

    if (isNaN(labelId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid label ID" });
    }

    const result = updateLabelSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const existing = await prisma.label.findFirst({
      where: { id: labelId, userId },
      select: { id: true },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Label not found" });
    }

    if (result.data.name !== undefined) {
      const duplicate = await findDuplicate(userId, result.data.name, labelId);
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "A label with that name already exists",
        });
      }
    }

    const changes: { name?: string; color?: string } = {};
    if (result.data.name !== undefined) changes.name = result.data.name;
    if (result.data.color !== undefined) changes.color = result.data.color;

    const updated = await prisma.label.update({
      where: { id: labelId },
      data: changes,
      include: labelInclude,
    });

    return res.status(200).json({
      success: true,
      label: toLabelDto(updated),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const userId: number = req.userId!;
    const labelId = Number(req.params.id);

    if (isNaN(labelId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid label ID" });
    }

    const existing = await prisma.label.findFirst({
      where: { id: labelId, userId },
      select: { id: true },
    });

    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Label not found" });
    }

    await prisma.label.delete({ where: { id: labelId } });

    return res.status(200).json({
      success: true,
      message: "Label deleted",
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
