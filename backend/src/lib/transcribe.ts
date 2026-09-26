import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const transcribeAudio = async (audioBuffer: Buffer): Promise<string> => {
  const res = await openai.audio.transcriptions.create({
    file: new File([new Uint8Array(audioBuffer)], "recording.webm", {
      type: "audio/webm",
    }),
    model: "whisper-1",
    language: "en",
  });

  return res.text || "";
};
