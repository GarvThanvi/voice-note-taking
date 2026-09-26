import { Router } from "express";
import bcrypt from "bcrypt";
import { google } from "googleapis";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/jwt.js";
import { signupSchema, signinSchema } from "../schemas/auth.js";
import { googleClient } from "../config/google.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  signupLimiter,
  signinLimiter,
} from "../middlewares/rateLimit.middleware.js";

const router = Router();

const googleScopes = ["openid", "profile", "email"];

router.post("/signup", signupLimiter, async (req, res, next) => {
  try {
    const result = signupSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message,
      });
    }
    const userData = result.data;

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

    const token = signToken(newUser.id);
    return res.json({
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
    return next(error);
  }
});

router.post("/signin", signinLimiter, async (req, res, next) => {
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

    if (user.googleId && !user.password) {
      return res.status(401).json({
        success: false,
        message: "This account was signed up with Google",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password!);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = signToken(user.id);

    return res.json({
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
    return next(error);
  }
});

router.get("/me", authMiddleware, async (req, res, next) => {
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
    return next(error);
  }
});

router.get("/google", (req, res) => {
  const url = googleClient.generateAuthUrl({
    access_type: "offline",
    scope: googleScopes,
    prompt: "select_account",
  });

  res.redirect(url);
});

router.get("/google/callback", async (req, res, next) => {
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
      const newUser = await prisma.user.create({
        data: {
          username: data.name!,
          email: data.email!,
          profilePicture: data.picture!,
          googleId: data.id!,
        },
      });

      const token = signToken(newUser.id);
      return res.redirect(
        `${process.env.FRONTEND_URL}/auth/google-success?token=${token}`,
      );
    }

    const token = signToken(user.id);

    if (!user.profilePicture || !user.googleId) {
      await prisma.user.update({
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

export default router;
