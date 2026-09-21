import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { newsletterSubscribeSchema } from "../schemas/newsletter.js";

const router = Router();

const TOO_MANY_REQUESTS = {
  success: false,
  message: "Too many requests. Please try again later.",
};

const subscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});

router.post("/subscribe", subscribeLimiter, async (req, res) => {
  try {
    const result = newsletterSubscribeSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message,
      });
    }

    const email = result.data.email.trim().toLowerCase();

    await prisma.newsletterSubscriber.upsert({
      where: { email },
      create: { email },
      update: { unsubscribedAt: null },
    });

    return res.status(200).json({
      success: true,
      message: "You're on the list. Thanks for subscribing!",
    });
  } catch (error) {
    console.error("Error while subscribing to newsletter", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

export default router;
