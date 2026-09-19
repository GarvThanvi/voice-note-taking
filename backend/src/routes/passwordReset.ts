import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma.js";
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  OTP_TTL_MS,
  MAX_OTP_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
} from "../lib/otp.js";
import { sendEmail } from "../lib/email.js";
import { passwordResetOtpEmail } from "../lib/emailTemplates.js";
import {
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} from "../schemas/auth.js";

const router = Router();

const GENERIC_FORGOT_MESSAGE =
  "If an account exists for that email, we've sent a password reset code.";

const TOO_MANY_REQUESTS = {
  success: false,
  message: "Too many requests. Please try again later.",
};

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});

const findLatestOtp = (userId: number) =>
  prisma.passwordResetOtp.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

router.post("/forgot-password", forgotLimiter, async (req, res) => {
  try {
    const result = forgotPasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message,
      });
    }

    const { email } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const latest = await findLatestOtp(user.id);
      const withinCooldown =
        latest &&
        Date.now() - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS;

      if (!withinCooldown) {
        await prisma.passwordResetOtp.deleteMany({ where: { userId: user.id } });

        const otp = generateOtp();
        const otpHash = await hashOtp(otp);

        await prisma.passwordResetOtp.create({
          data: {
            userId: user.id,
            otpHash,
            expiresAt: new Date(Date.now() + OTP_TTL_MS),
          },
        });

        const { subject, html, text } = passwordResetOtpEmail(otp);
        try {
          await sendEmail({ to: user.email, subject, html, text });
        } catch (emailError) {
          console.error("Failed to send password reset email:", emailError);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: GENERIC_FORGOT_MESSAGE,
    });
  } catch (error) {
    console.error("Error in forgot-password:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

router.post("/verify-reset-otp", resetLimiter, async (req, res) => {
  try {
    const result = verifyOtpSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message,
      });
    }

    const { email, otp } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });
    const record = user ? await findLatestOtp(user.id) : null;

    if (!user || !record || record.expiresAt.getTime() < Date.now()) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired code." });
    }

    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      return res.status(400).json({
        success: false,
        message: "Too many incorrect attempts. Please request a new code.",
      });
    }

    const valid = await verifyOtp(otp, record.otpHash);
    if (!valid) {
      await prisma.passwordResetOtp.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired code." });
    }

    return res.status(200).json({ success: true, message: "Code verified." });
  } catch (error) {
    console.error("Error in verify-reset-otp:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

router.post("/reset-password", resetLimiter, async (req, res) => {
  try {
    const result = resetPasswordSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error.issues[0]?.message,
      });
    }

    const { email, otp, password } = result.data;
    const user = await prisma.user.findUnique({ where: { email } });
    const record = user ? await findLatestOtp(user.id) : null;

    if (
      !user ||
      !record ||
      record.expiresAt.getTime() < Date.now() ||
      record.attempts >= MAX_OTP_ATTEMPTS
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired code. Please request a new one.",
      });
    }

    const valid = await verifyOtp(otp, record.otpHash);
    if (!valid) {
      await prisma.passwordResetOtp.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired code." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetOtp.deleteMany({ where: { userId: user.id } }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Password updated. You can now log in.",
    });
  } catch (error) {
    console.error("Error in reset-password:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

export default router;
