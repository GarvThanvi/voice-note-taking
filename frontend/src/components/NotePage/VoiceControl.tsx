import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, AudioWaveform, Loader2, CheckCircle2, AlertCircle, HelpCircle, Undo2 } from "lucide-react";
import { sendVoiceCommand, undoVoiceAction, type VoiceIntent, type ExecutionResult } from "../../api/voiceApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "idle" | "listening" | "processing";

interface Toast {
  kind: "success" | "error" | "ambiguous";
  message: string;
  transcript?: string;
  intent?: VoiceIntent | null;
  execution?: ExecutionResult | null;
  undoToken?: string;
}

interface VoiceControlProps {
  onTranscript?: (transcript: string) => void;
  onIntent?: (intent: VoiceIntent) => void;
  onActionDone?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  create_note: "Create note",
  add_todo: "Add todo",
  mark_done: "Mark done",
  update_todo: "Update todo",
  archive: "Archive",
  search: "Search",
};

// ---------------------------------------------------------------------------
// VoiceControl
// ---------------------------------------------------------------------------

const VoiceControl = ({ onTranscript, onIntent, onActionDone }: VoiceControlProps) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [undoing, setUndoing] = useState(false);

  const phaseRef = useRef<Phase>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const setPhaseSync = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // -----------------------------------------------------------------------
  // Recording lifecycle
  // -----------------------------------------------------------------------

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  };

  const finishRecording = useCallback(() => {
    if (phaseRef.current !== "listening") return;
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }, []);

  const sendAudio = useCallback(
    async (blob: Blob) => {
      if (phaseRef.current === "processing") {
        cleanupStream();
        return;
      }

      setPhaseSync("processing");

      try {
        const data = await sendVoiceCommand(blob);

        if (data.success && data.transcript) {
          const exec = data.execution;
          let message = data.transcript;
          let kind: Toast["kind"] = "success";

          if (exec) {
            if (exec.status === "done") {
              message = exec.summary;
            } else if (exec.status === "ambiguous") {
              kind = "ambiguous";
              const names = exec.candidates
                ?.map((c) => `"${c.title || "Untitled"}"`)
                .join(", ");
              message = `Did you mean: ${names || "multiple options"}?`;
            } else if (exec.status === "not_found") {
              kind = "error";
              message = exec.summary;
            }
          } else if (data.resolution?.status === "found") {
            const t = data.resolution.target;
            message = t.todoText
              ? `"${t.todoText}" in "${t.title || "Untitled"}"`
              : `"${t.title || "Untitled"}"`;
          } else if (data.resolution?.status === "ambiguous") {
            kind = "ambiguous";
            const names = data.resolution.candidates
              .map((c) => `"${c.title || "Untitled"}"`)
              .join(", ");
            message = `Did you mean: ${names}?`;
          } else if (data.resolution?.status === "not_found") {
            kind = "error";
            message = `No matching note found for "${data.intent?.note_hint || data.transcript}"`;
          } else if (data.intent) {
            message = `${ACTION_LABELS[data.intent.action] || data.intent.action}${data.intent.note_hint ? ` → "${data.intent.note_hint}"` : ""}`;
          }

          setToast({
            kind,
            message,
            transcript: data.transcript,
            intent: data.intent,
            execution: exec,
            undoToken: exec?.undoToken,
          });
          onTranscript?.(data.transcript);
          if (data.intent) onIntent?.(data.intent);
          if (exec?.status === "done") onActionDone?.();
        } else {
          setToast({ kind: "error", message: data.message || "Transcription returned no text." });
        }
      } catch (err) {
        setToast({
          kind: "error",
          message: err instanceof Error ? err.message : "Network error while processing voice.",
        });
      } finally {
        cleanupStream();
        setPhaseSync("idle");
      }
    },
    [onTranscript, onIntent, onActionDone, setPhaseSync]
  );

  const startRecording = useCallback(async () => {
    if (phaseRef.current !== "idle") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        cleanupStream();
        sendAudio(blob);
      };

      recorderRef.current = recorder;
      recorder.start();
      setPhaseSync("listening");
    } catch (err) {
      console.error("Mic access error:", err);
      setToast({
        kind: "error",
        message: "Microphone access denied. Please allow microphone permissions and try again.",
      });
    }
  }, [sendAudio, setPhaseSync]);

  // -----------------------------------------------------------------------
  // Undo handler
  // -----------------------------------------------------------------------

  const handleUndo = useCallback(async () => {
    if (!toast?.undoToken || undoing) return;
    setUndoing(true);
    try {
      await undoVoiceAction(toast.undoToken);
      setToast(null);
      onActionDone?.();
    } catch {
      // silent
    } finally {
      setUndoing(false);
    }
  }, [toast?.undoToken, undoing, onActionDone]);

  // -----------------------------------------------------------------------
  // Global keybind
  // -----------------------------------------------------------------------

  useEffect(() => {
    const isTypingTarget = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.repeat) return;
      if (isTypingTarget(e)) return;
      e.preventDefault();
      startRecording();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (phaseRef.current === "listening") finishRecording();
    };

    const onBlur = () => {
      if (phaseRef.current === "listening") finishRecording();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
      cleanupStream();
    };
  }, [startRecording, finishRecording]);

  // -----------------------------------------------------------------------
  // Toast auto-dismiss
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* ---------- Listening / Processing pill ---------- */}
      {phase !== "idle" && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]">
          <div className="flex items-center gap-3 rounded-full border border-primary/30 bg-surface px-5 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
            {phase === "listening" ? (
              <>
                <AudioWaveform size={18} className="text-primary animate-pulse" />
                <span className="text-sm font-medium text-foreground select-none">
                  Listening… release to send
                </span>
              </>
            ) : (
              <>
                <Loader2 size={18} className="text-primary animate-spin" />
                <span className="text-sm font-medium text-foreground select-none">
                  Processing…
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------- Result toast ---------- */}
      {toast && phase === "idle" && (
        <div className="fixed top-20 right-6 z-[100] w-[380px] animate-in slide-in-from-right">
          <div
            className={`
              rounded-2xl border p-4 shadow-2xl bg-surface
              ${toast.kind === "success" ? "border-primary/30" : toast.kind === "ambiguous" ? "border-yellow-500/40" : "border-red-500/40"}
            `}
          >
            <div className="flex items-start gap-3">
              {toast.kind === "success" && (
                <CheckCircle2 size={18} className="text-primary mt-0.5 shrink-0" />
              )}
              {toast.kind === "ambiguous" && (
                <HelpCircle size={18} className="text-yellow-500 mt-0.5 shrink-0" />
              )}
              {toast.kind === "error" && (
                <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  {toast.kind === "success" ? "Done" : toast.kind === "ambiguous" ? "Ambiguous" : "Voice error"}
                </p>
                <p className="text-sm text-foreground leading-relaxed">{toast.message}</p>

                {toast.intent && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                      {ACTION_LABELS[toast.intent.action]}
                    </span>
                    {toast.intent.note_hint && (
                      <span className="inline-flex items-center rounded-full bg-surface-elevated px-2.5 py-0.5 text-[11px] text-muted-foreground">
                        note: {toast.intent.note_hint}
                      </span>
                    )}
                    {toast.intent.todo_hint && (
                      <span className="inline-flex items-center rounded-full bg-surface-elevated px-2.5 py-0.5 text-[11px] text-muted-foreground">
                        todo: {toast.intent.todo_hint}
                      </span>
                    )}
                    {toast.intent.confidence < 0.6 && (
                      <span className="inline-flex items-center rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-[11px] text-yellow-600">
                        low confidence
                      </span>
                    )}
                  </div>
                )}

                {toast.undoToken && (
                  <button
                    onClick={handleUndo}
                    disabled={undoing}
                    className="
                      mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                      bg-surface-elevated hover:bg-surface text-xs font-medium
                      text-muted-foreground hover:text-foreground transition-colors
                      disabled:opacity-50
                    "
                  >
                    <Undo2 size={13} />
                    {undoing ? "Undoing…" : "Undo"}
                  </button>
                )}
              </div>

              <button
                onClick={() => setToast(null)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Mic button ---------- */}
      {phase === "idle" && (
        <div className="fixed bottom-8 right-8 z-[100]">
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              startRecording();
            }}
            onMouseUp={finishRecording}
            onMouseLeave={finishRecording}
            className="
              w-14 h-14 rounded-full bg-primary hover:bg-primary-hover text-white
              flex items-center justify-center shadow-[0_4px_20px_rgba(255,64,88,0.35)]
              transition-all duration-200 select-none active:scale-95
            "
            title="Hold to speak  ·  Ctrl+Space"
          >
            <Mic size={22} />
          </button>
        </div>
      )}
    </>
  );
};

export default VoiceControl;
