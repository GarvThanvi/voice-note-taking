import { useEffect, useRef } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";

const LENGTH = 6;

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}

const OtpInput = ({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
}: OtpInputProps) => {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) inputsRef.current[0]?.focus();
  }, [autoFocus]);

  const focusAt = (index: number) => {
    const target = Math.max(0, Math.min(LENGTH - 1, index));
    inputsRef.current[target]?.focus();
  };

  const commit = (next: string) => onChange(next.replace(/\D/g, "").slice(0, LENGTH));

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);

    if (!digit) {
      if (index === value.length - 1) commit(value.slice(0, index));
      return;
    }

    if (index > value.length) {
      focusAt(value.length);
      return;
    }

    const chars = value.split("");
    chars[index] = digit;
    commit(chars.join(""));
    focusAt(index + 1);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const chars = value.split("");
      if (chars[index]) {
        chars.splice(index, 1);
        commit(chars.join(""));
        focusAt(index);
      } else if (index > 0) {
        chars.splice(index - 1, 1);
        commit(chars.join(""));
        focusAt(index - 1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusAt(index - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    commit(pasted);
    focusAt(pasted.length);
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {Array.from({ length: LENGTH }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={value[index] ?? ""}
          disabled={disabled}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="
            h-12
            w-full
            min-w-0
            flex-1
            rounded-button
            border
            border-border
            bg-background
            text-center
            text-lg
            font-semibold
            text-foreground
            outline-none
            transition-all
            duration-200
            focus:border-primary/50
            focus:ring-2
            focus:ring-primary/10
            disabled:opacity-50
          "
        />
      ))}
    </div>
  );
};

export default OtpInput;
