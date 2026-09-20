import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, Loader2, CheckCircle2, AlertCircle, HelpCircle, Info, Undo2 } from "lucide-react";
import { sendVoiceCommand, undoVoiceAction, type VoiceIntent, type ExecutionResult } from "../../api/voiceApi";
import type { Note } from "../../api/noteApi";

type Phase = "idle" | "listening" | "processing";

interface Toast {
  kind: "success" | "error" | "ambiguous" | "info";
  message: string;
  transcript?: string;
  intent?: VoiceIntent | null;
  execution?: ExecutionResult | null;
  undoToken?: string;
}

interface VoiceControlProps {
  onTranscript?: (transcript: string) => void;
  onIntent?: (intent: VoiceIntent) => void;
  onActionDone?: (note?: Note) => void;
  onUndo?: () => void;
  onSearch?: (query: string) => void;
}

const ACTION_LABELS: Record<string, string> = {
  create_note: "Create note",
  add_todo: "Add todo",
  mark_done: "Mark done",
  update_todo: "Update todo",
  update_note: "Update note",
  archive: "Archive",
  search: "Search",
};

const HUD_BARS = [
  { height: 10, duration: 1.1, delay: 0 },
  { height: 18, duration: 0.8, delay: 0.15 },
  { height: 24, duration: 1.3, delay: 0.05 },
  { height: 18, duration: 0.9, delay: 0.25 },
  { height: 12, duration: 1.2, delay: 0.1 },
];

const MIN_RECORDING_MS = 400;

const VoiceControl = ({ onTranscript, onIntent, onActionDone, onUndo, onSearch }: VoiceControlProps) => {
  const [phase, setPhase] = useState<Phase>("idle");
  const [toast, setToast] = useState<Toast | null>(null);
  const [undoing, setUndoing] = useState(false);

  const phaseRef = useRef<Phase>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startingRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const sourceRef = useRef<"pointer" | "key" | null>(null);
  const startedAtRef = useRef(0);

  const setPhaseSync = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  };

  const finishRecording = useCallback((source?: "pointer" | "key") => {
    if (source && sourceRef.current !== source) return;
    if (phaseRef.current === "listening") {
      const recorder = recorderRef.current;
      if (recorder && recorder.state === "recording") {
        recorder.stop();
      }
    } else if (startingRef.current) {
      stopRequestedRef.current = true;
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
          if (exec?.status === "done") {
            onActionDone?.(exec.note);
            if (exec.action === "search" && exec.searchQuery) {
              onSearch?.(exec.searchQuery);
            }
          }
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
    [onTranscript, onIntent, onActionDone, onSearch, setPhaseSync]
  );

  const startRecording = useCallback(async (source: "pointer" | "key" = "pointer") => {
    if (phaseRef.current !== "idle" || startingRef.current) return;

    startingRef.current = true;
    stopRequestedRef.current = false;
    sourceRef.current = source;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      if (stopRequestedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

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
        const duration = Date.now() - startedAtRef.current;
        if (duration < MIN_RECORDING_MS) {
          cleanupStream();
          setPhaseSync("idle");
          setToast({
            kind: "info",
            message: "That was too short — hold to speak, then release to send.",
          });
          return;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        cleanupStream();
        sendAudio(blob);
      };

      recorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setPhaseSync("listening");
    } catch (err) {
      console.error("Mic access error:", err);
      setToast({
        kind: "error",
        message: "Microphone access denied. Please allow microphone permissions and try again.",
      });
    } finally {
      startingRef.current = false;
    }
  }, [sendAudio, setPhaseSync]);

  const handleUndo = useCallback(async () => {
    if (!toast?.undoToken || undoing) return;
    setUndoing(true);
    try {
      await undoVoiceAction(toast.undoToken);
      setToast(null);
      onActionDone?.();
      onUndo?.();
    } catch {
      // silent
    } finally {
      setUndoing(false);
    }
  }, [toast?.undoToken, undoing, onActionDone, onUndo]);

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
      startRecording("key");
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      finishRecording("key");
    };

    const onPointerUp = () => {
      finishRecording("pointer");
    };

    const onBlur = () => {
      finishRecording();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("blur", onBlur);
      cleanupStream();
    };
  }, [startRecording, finishRecording]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <>
      {toast && phase === "idle" && (
        <div className="fixed top-20 right-4 left-4 sm:left-auto sm:right-6 z-[100] w-auto sm:w-[380px] animate-in slide-in-from-right">
          <div
            className={`
              rounded-2xl border p-4 shadow-2xl bg-surface
              ${toast.kind === "success" ? "border-primary/30" : toast.kind === "ambiguous" ? "border-yellow-500/40" : toast.kind === "info" ? "border-border" : "border-red-500/40"}
            `}
          >
            <div className="flex items-start gap-3">
              {toast.kind === "success" && (
                <CheckCircle2 size={18} className="text-primary mt-0.5 shrink-0" />
              )}
              {toast.kind === "ambiguous" && (
                <HelpCircle size={18} className="text-yellow-500 mt-0.5 shrink-0" />
              )}
              {toast.kind === "info" && (
                <Info size={18} className="text-muted-foreground mt-0.5 shrink-0" />
              )}
              {toast.kind === "error" && (
                <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  {toast.kind === "success" ? "Done" : toast.kind === "ambiguous" ? "Ambiguous" : toast.kind === "info" ? "Voice" : "Voice error"}
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

      {phase === "listening" && (
        <div
          className="voice-glow pointer-events-none fixed inset-x-0 bottom-0 z-[90] h-[240px] overflow-hidden lg:left-[260px]"
          aria-hidden="true"
        >
          <div className="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-primary/25 via-primary/5 to-transparent" />
          <div className="absolute -bottom-24 left-[15%] h-52 w-[70%] rounded-full bg-primary/35 blur-3xl animate-voice-drift" />
          <div className="absolute -bottom-32 right-[10%] h-52 w-[55%] rounded-full bg-primary/25 blur-3xl animate-voice-drift-slow" />
        </div>
      )}

      <div className="fixed bottom-6 right-5 sm:bottom-8 sm:right-8 z-[100]">
        <div className="relative">
          {phase === "listening" && (
            <div className="absolute bottom-full right-0 mb-4 animate-voice-hud-enter">
              <div className="w-max rounded-2xl border border-primary/30 bg-surface/95 px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur">
                <p className="text-xs font-semibold text-foreground select-none">
                  Listening…
                </p>
                <div className="mt-2 flex h-6 items-end gap-1">
                  {HUD_BARS.map((bar, i) => (
                    <span
                      key={i}
                      className="w-[3px] origin-bottom rounded-full bg-primary animate-voice-eq"
                      style={{
                        height: bar.height,
                        animationDuration: `${bar.duration}s`,
                        animationDelay: `${bar.delay}s`,
                      }}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground select-none">
                  Release to stop
                </p>
              </div>
            </div>
          )}

          {phase === "processing" && (
            <div className="absolute bottom-full right-0 mb-4 animate-voice-hud-enter">
              <div className="flex w-max items-center gap-2 rounded-2xl border border-border bg-surface/95 px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur">
                <Loader2 size={15} className="text-primary animate-spin" />
                <span className="text-xs font-medium text-foreground select-none">
                  Processing…
                </span>
              </div>
            </div>
          )}

          <button
            onPointerDown={(e) => {
              e.preventDefault();
              startRecording("pointer");
            }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={phase === "processing"}
            className="
              relative w-14 h-14 rounded-full bg-primary hover:bg-primary-hover text-white
              flex items-center justify-center shadow-[0_4px_20px_rgba(255,64,88,0.35)]
              transition-all duration-200 select-none touch-none active:scale-95
              disabled:cursor-default
            "
            title="Hold to speak  ·  Ctrl+Space"
            aria-label="Hold to speak"
          >
            {phase === "listening" && (
              <span
                className="absolute inset-0 rounded-full bg-primary/40 animate-ring-pulse"
                aria-hidden="true"
              />
            )}
            {phase === "processing" ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <Mic size={22} />
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default VoiceControl;
