import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { voiceLimiter } from "../middlewares/rateLimit.middleware.js";
import { transcribeAudio } from "../lib/transcribe.js";
import { extractIntent } from "../lib/extractIntent.js";
import { resolveTarget } from "../lib/resolveTarget.js";
import { executeAction } from "../lib/executeAction.js";

const router = Router();

const ALLOWED_AUDIO_MIME = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "video/webm",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AUDIO_MIME.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error("UNSUPPORTED_AUDIO_TYPE"));
  },
});

const uploadAudio = upload.single("audio");

const handleAudioUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadAudio(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "Audio file too large (max 25MB).",
        });
      }
      if (error.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          success: false,
          message: "Unexpected file field.",
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: "Unsupported or invalid audio file.",
    });
  });
};

router.post(
  "/command",
  authMiddleware,
  voiceLimiter,
  handleAudioUpload,
  async (req, res) => {
    try {
      const userId: number = req.userId!;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No audio file provided",
        });
      }

      const transcript = await transcribeAudio(req.file.buffer);

      if (!transcript.trim()) {
        return res.status(200).json({
          success: true,
          transcript,
          intent: null,
          resolution: null,
          execution: null,
          userId,
          message: "No speech detected in audio.",
        });
      }

      const intent = await extractIntent(transcript);

      const resolution = await resolveTarget(
        userId,
        intent.note_hint,
        intent.todo_hint,
        intent.action
      );

      const execution = await executeAction(userId, intent, resolution);

      return res.status(200).json({
        success: true,
        transcript,
        intent,
        resolution,
        execution,
        userId,
      });
    } catch (error) {
      console.error("Voice command error:", error);
      return res.status(500).json({
        success: false,
        message: "Something went wrong while processing your request.",
      });
    }
  }
);

export default router;
