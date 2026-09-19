import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { guidePreferencesSchema } from "../schemas/auth.js";

const router = Router();

router.put("/guide", authMiddleware, async (req, res) => {
  try {
    const userId: number = req.userId!;
    const result = guidePreferencesSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message,
      });
    }

    const data = Object.fromEntries(
      Object.entries(result.data).filter(([, value]) => value !== undefined),
    );

    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        email: true,
        profilePicture: true,
        hasSeenGuide: true,
        showGuideOnLogin: true,
      },
    });

    return res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Error updating guide preferences:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

export default router;
