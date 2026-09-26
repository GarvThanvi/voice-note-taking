import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.js";
import noteRoutes from "./routes/note.js";
import voiceRoutes from "./routes/voice.js";
import voiceUndoRoutes from "./routes/voiceUndo.js";
import passwordResetRoutes from "./routes/passwordReset.js";
import guideRoutes from "./routes/guide.js";
import newsletterRoutes from "./routes/newsletter.js";
import { notFound, errorHandler } from "./middlewares/error.middleware.js";
import { globalLimiter } from "./middlewares/rateLimit.middleware.js";

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet());
app.use(express.json());

const allowedOrigins = (process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn(
    "FRONTEND_URL is not set; cross-origin browser requests will be blocked.",
  );
}

app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.includes(origin)),
  }),
);

app.use(globalLimiter);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/auth", passwordResetRoutes);
app.use("/api/auth", guideRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/note", noteRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/voice", voiceUndoRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server started at port ${PORT}`);
});

export default app;
