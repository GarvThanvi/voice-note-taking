import { useCallback, useEffect, useState } from "react";
import {
  X,
  Mic,
  AudioWaveform,
  FileText,
  ArrowRight,
  Plus,
  Check,
  Pencil,
  Archive,
  Search,
  RotateCcw,
} from "lucide-react";
import Button from "../ui/Button";

interface VoiceGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  showOnNextLogin: boolean;
  onShowOnNextLoginChange: (value: boolean) => void;
}

//voice actions
const voiceExamples = [
  {
    icon: FileText,
    title: "Create a note",
    example: "Create a note about my project ideas",
  },
  {
    icon: Plus,
    title: "Add a todo",
    example: "Add take meds to my todo list",
  },
  {
    icon: Check,
    title: "Mark as done",
    example: "Mark gym as done",
  },
  {
    icon: Pencil,
    title: "Update a note or todo",
    example: "Change my todo to Sunday",
  },
  {
    icon: Archive,
    title: "Archive",
    example: "Archive my meeting notes",
  },
  {
    icon: Search,
    title: "Search",
    example: "Find my notes about React",
  },
];

const VoiceGuideModal = ({
  isOpen,
  onClose,
  showOnNextLogin,
  onShowOnNextLoginChange,
}: VoiceGuideModalProps) => {
  const [step, setStep] = useState<1 | 2>(1);

  const handleClose = useCallback(() => {
    setStep(1);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="
          relative
          flex
          h-[72vh]
          max-h-[85vh]
          min-h-[480px]
          w-full
          max-w-[900px]
          flex-col
          overflow-hidden
          rounded-[16px]
          border
          border-border
          bg-background
          shadow-[0_24px_80px_rgba(0,0,0,0.55)]
        "
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[58px] shrink-0 items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center text-primary">
              <AudioWaveform size={20} strokeWidth={2.5} />
            </div>

            <span className="text-[15px] font-semibold text-foreground">
              NoteFlow
            </span>
          </div>

          <button
            onClick={handleClose}
            className="
              flex
              h-8
              w-8
              items-center
              justify-center
              rounded-lg
              text-muted
              transition
              hover:bg-surface
              hover:text-foreground
            "
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-5">
          <div key={step} className="flex flex-1 flex-col animate-auth-enter">
            {step === 1 ? <StepOne /> : <StepTwo />}
          </div>
        </div>

        <div className="shrink-0 border-t border-border px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Preference */}
            <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showOnNextLogin}
                onChange={(e) => onShowOnNextLoginChange(e.target.checked)}
                className="peer sr-only"
              />
              <span
                className={`
                  flex
                  h-[16px]
                  w-[16px]
                  items-center
                  justify-center
                  rounded-[4px]
                  border
                  transition
                  peer-focus-visible:ring-2
                  peer-focus-visible:ring-primary/30
                  ${
                    showOnNextLogin
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-surface"
                  }
                `}
              >
                {showOnNextLogin && <Check size={11} />}
              </span>
              Show this on next login
            </label>

            {/* Actions */}
            {step === 1 ? (
              <Button onClick={() => setStep(2)} className="shrink-0">
                Get Started
                <ArrowRight size={16} />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  Back
                </Button>

                <Button onClick={handleClose}>
                  Got it! Let's go
                  <ArrowRight size={16} />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="flex shrink-0 items-center justify-center gap-1.5 pb-2.5">
          <span
            className={`
              h-1 rounded-full transition-all
              ${step === 1 ? "w-5 bg-primary" : "w-1.5 bg-border"}
            `}
          />

          <span
            className={`
              h-1 rounded-full transition-all
              ${step === 2 ? "w-5 bg-primary" : "w-1.5 bg-border"}
            `}
          />
        </div>
      </div>
    </div>
  );
};

const StepOne = () => {
  return (
    <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:grid-rows-1">
      {/* =====================================
          LEFT — STEPS
      ====================================== */}

      <div className="flex h-full min-w-0 flex-col border-b border-border pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
        {/* Heading */}
        <div className="mb-4">
          <h2 className="text-[34px] font-bold leading-[1.05] tracking-[-0.035em] text-foreground">
            Get started
            <br />
            in <span className="text-primary">seconds</span>
          </h2>

          <p className="mt-2.5 max-w-[270px] text-[15px] leading-[1.5] text-muted">
            Use your voice to capture thoughts, create todos, and stay
            organized.
          </p>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          {/* STEP 1 */}
          <div className="flex gap-3">
            <div
              className="
                flex
                h-[40px]
                w-[40px]
                shrink-0
                items-center
                justify-center
                rounded-full
                bg-primary
                text-[13px]
                font-semibold
                text-white
                shadow-[0_0_18px_rgba(255,64,88,0.25)]
              "
            >
              1
            </div>

            <div className="min-w-0 pt-1">
              <h3 className="text-[14px] font-semibold text-foreground">
                Open the mic
              </h3>

              <p className="mt-1 text-[12px] leading-[1.45] text-muted">
                Hold the mouse on the mic icon or hold Ctrl + Space
              </p>
            </div>
          </div>

          {/* Connecting line */}
          <div className="ml-[19px] h-6 w-px border-l border-border" />

          {/* STEP 2 */}
          <div className="flex gap-3">
            <div
              className="
                flex
                h-[40px]
                w-[40px]
                shrink-0
                items-center
                justify-center
                rounded-full
                border
                border-border
                bg-surface
                text-[13px]
                font-medium
                text-muted
              "
            >
              2
            </div>

            <div className="min-w-0 pt-1">
              <h3 className="text-[14px] font-semibold text-foreground">
                Speak naturally
              </h3>

              <p className="mt-1 text-[12px] leading-[1.45] text-muted">
                Just tell us what you want to do
              </p>
            </div>
          </div>

          {/* Connecting line */}
          <div className="ml-[19px] h-6 w-px border-l border-border" />

          {/* STEP 3 */}
          <div className="flex gap-3">
            <div
              className="
                flex
                h-[40px]
                w-[40px]
                shrink-0
                items-center
                justify-center
                rounded-full
                border
                border-border
                bg-surface
                text-[13px]
                font-medium
                text-muted
              "
            >
              3
            </div>

            <div className="min-w-0 pt-1">
              <h3 className="text-[14px] font-semibold text-foreground">
                See it added
              </h3>

              <p className="mt-1 text-[12px] leading-[1.45] text-muted">
                Your note or todo will be created automatically.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================
          RIGHT — LIVE VOICE DEMO
      ====================================== */}

      <div className="flex h-full min-w-0 flex-col gap-4">
        {/* Listening card */}
        <div
          className="
            flex
            flex-1
            flex-col
            overflow-hidden
            rounded-xl
            border
            border-border
            bg-surface/70
          "
        >
          {/* Listening header */}
          <div
            className="
              flex
              items-center
              justify-between
              border-b
              border-border-subtle
              px-4
              py-3
            "
          >
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(255,64,88,0.8)]" />

              <span className="text-[12px] text-muted">Listening...</span>
            </div>

            <span className="text-[12px] text-muted">0:03</span>
          </div>

          {/* Transcript */}
          <div className="flex flex-1 flex-col justify-center gap-6 px-4 pb-4 pt-4">
            <p className="max-w-[340px] text-[16px] font-medium leading-[1.5] text-foreground">
              “Create a todo list for Saturday,
              <br />
              I want to complete my assignment,
              <br />
              take my dog for a walk”
            </p>

            {/* Bottom controls */}
            <div className="flex items-center justify-between">
              {/* Mic */}
              <div
                className="
                  flex
                  h-[44px]
                  w-[44px]
                  items-center
                  justify-center
                  rounded-full
                  bg-primary
                  text-white
                  shadow-[0_0_18px_rgba(255,64,88,0.35)]
                "
              >
                <Mic size={20} strokeWidth={2.3} />
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="
                    flex
                    items-center
                    gap-1.5
                    rounded-md
                    bg-surface-elevated
                    px-3
                    py-2
                    text-[12px]
                    text-muted
                  "
                >
                  <span className="text-foreground">Ctrl</span>

                  <span>+</span>

                  <span className="text-foreground">Space</span>

                  <span className="ml-1 text-muted-foreground">⌘</span>
                </div>

                <span className="text-[12px] text-muted">to speak</span>
              </div>
            </div>
          </div>
        </div>

        {/* Todo result */}
        <div
          className="
            flex
            items-center
            gap-3
            rounded-xl
            border
            border-border
            bg-surface/60
            px-4
            py-4
          "
        >
          {/* Success icon */}
          <div
            className="
              flex
              h-[40px]
              w-[40px]
              shrink-0
              items-center
              justify-center
              rounded-full
              bg-primary/10
              text-primary
            "
          >
            <Check size={20} strokeWidth={2.5} />
          </div>

          {/* Text */}
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold text-foreground">
              Todo list created
            </h3>

            <p className="mt-1 text-[11px] text-muted">2 items added</p>
          </div>

          <ArrowRight size={18} className="ml-auto text-muted-foreground" />
        </div>
      </div>
    </div>
  );
};

/* ============================================
   STEP 2
   ============================================ */

const StepTwo = () => {
  return (
    <div className="flex flex-1 flex-col justify-center">
      {/* Heading */}
      <div className="mb-4 text-center">
        <h2 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-foreground">
          What you can <span className="text-primary">say</span>
        </h2>

        <p className="mt-1.5 text-[13px] text-muted">
          Here are a few things you can try.
        </p>
      </div>

      {/* --------------------------------
          Feature grid
      -------------------------------- */}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {voiceExamples.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.title}
              className="
                flex
                items-center
                gap-3
                rounded-xl
                border
                border-border-subtle
                bg-surface/60
                p-3.5
                transition-colors
                hover:border-border
                hover:bg-surface
              "
            >
              <div
                className="
                  flex
                  h-10
                  w-10
                  shrink-0
                  items-center
                  justify-center
                  rounded-lg
                  bg-primary/10
                  text-primary
                "
              >
                <Icon size={20} strokeWidth={2} />
              </div>

              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold leading-tight text-foreground">
                  {item.title}
                </h3>

                <p className="mt-1 text-[11px] leading-[1.5] text-muted">
                  “{item.example}”
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* --------------------------------
          Undo
      -------------------------------- */}

      <div
        className="
          mt-2.5
          flex
          items-center
          gap-3
          rounded-xl
          border
          border-border-subtle
          bg-surface/60
          px-4
          py-3
        "
      >
        <div
          className="
            flex
            h-10
            w-10
            shrink-0
            items-center
            justify-center
            rounded-lg
            bg-primary/10
            text-primary
          "
        >
          <RotateCcw size={20} strokeWidth={2} />
        </div>

        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground">
            Made a mistake?
          </h3>

          <p className="mt-0.5 text-[11px] text-muted">
            Tap the “Undo” button and we'll revert your last action.
          </p>
        </div>

        <div
          className="
            ml-auto
            shrink-0
            rounded-lg
            bg-surface-elevated
            px-3
            py-1.5
            text-[11px]
            font-medium
            text-muted
          "
        >
          Tap Undo
        </div>
      </div>
    </div>
  );
};

export default VoiceGuideModal;
