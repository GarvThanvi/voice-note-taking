import { useCallback, useEffect, useState } from "react";
import { X, AudioWaveform, ArrowRight, Check } from "lucide-react";
import Button from "../../ui/Button";
import StepOne from "./StepOne";
import StepTwo from "./StepTwo";

interface VoiceGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  showOnNextLogin: boolean;
  onShowOnNextLoginChange: (value: boolean) => void;
}

const ProgressDots = ({ step }: { step: 1 | 2 }) => (
  <div className="flex shrink-0 items-center justify-center gap-1.5 pb-2.5">
    {([1, 2] as const).map((value) => (
      <span
        key={value}
        className={`
          h-1 rounded-full transition-all
          ${step === value ? "w-5 bg-primary" : "w-1.5 bg-border"}
        `}
      />
    ))}
  </div>
);

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
          max-h-[680px]
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
        {/* Header */}
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

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-5">
          <div key={step} className="flex flex-1 flex-col animate-auth-enter">
            {step === 1 ? <StepOne /> : <StepTwo />}
          </div>
        </div>

        {/* Footer */}
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

        <ProgressDots step={step} />
      </div>
    </div>
  );
};

export default VoiceGuideModal;
