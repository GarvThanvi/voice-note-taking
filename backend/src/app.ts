import "dotenv/config";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import noteRoutes from "./routes/note.js";
import voiceRoutes from "./routes/voice.js";
import voiceUndoRoutes from "./routes/voiceUndo.js";
import passwordResetRoutes from "./routes/passwordReset.js";
import guideRoutes from "./routes/guide.js";
import newsletterRoutes from "./routes/newsletter.js";
import { notFound, errorHandler } from "./middlewares/error.middleware.js";

const app = express();

app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL }));

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
