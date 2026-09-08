import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { transcribeAudio } from "../lib/transcribe.js";
import { extractIntent } from "../lib/extractIntent.js";
import { resolveTarget } from "../lib/resolveTarget.js";
import { executeAction } from "../lib/executeAction.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

/**
 * POST /api/voice/command
 *
 * Full pipeline: audio → transcript → intent → resolution → execution → undo token.
 */
router.post(
  "/command",
  authMiddleware,
  upload.single("audio"),
  async (req, res) => {
    try {
      const userId: number = req.userId!;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No audio file provided",
        });
      }

      // 1. Transcribe audio → text
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

      // 2. Extract structured intent from transcript
      const intent = await extractIntent(transcript);

      // 3. Resolve hints → real DB rows (notes/todos)
      const resolution = await resolveTarget(
        userId,
        intent.note_hint,
        intent.todo_hint
      );

      // 4. Execute the action if resolution is confident
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
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export default router;
