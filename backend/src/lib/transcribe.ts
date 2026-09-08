import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Transcribe a short audio clip to text using OpenAI Whisper.
 *
 * Kept isolated behind this function so the STT provider can be swapped later
 * (e.g. Deepgram streaming) without touching callers.
 */
export const transcribeAudio = async (audioBuffer: Buffer): Promise<string> => {
  const res = await openai.audio.transcriptions.create({
    file: new File([audioBuffer], "recording.webm", { type: "audio/webm" }),
    model: "whisper-1",
    language: "en",
  });

  return res.text || "";
};
