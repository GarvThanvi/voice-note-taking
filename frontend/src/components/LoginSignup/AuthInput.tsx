import {
  Eye,
  EyeOff,
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";

interface AuthInputProps {
  id: string;
  label: string;
  type?: "text" | "email" | "password";
  placeholder: string;
  icon: ReactNode;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}

const AuthInput = ({
  id,
  label,
  type = "text",
  placeholder,
  icon,
  value,
  onChange,
  showPassword = false,
  onTogglePassword,
}: AuthInputProps) => {
  const inputType =
    type === "password" && showPassword
      ? "text"
      : type;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-sm font-light text-foreground"
      >
        {label}
      </label>

      <div
        className="
          flex h-12 items-center gap-3
          rounded-button
          border border-border
          bg-background
          px-4
          transition-all duration-200
          focus-within:border-primary/50
          focus-within:ring-2
          focus-within:ring-primary/10
        "
      >
        {/* Left icon */}
        <span className="shrink-0 text-muted-foreground">
          {icon}
        </span>

        {/* Input */}
        <input
          id={id}
          type={inputType}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="
            min-w-0
            flex-1
            bg-transparent
            text-sm
            text-foreground
            outline-none
            placeholder:text-muted-foreground
            autofill:bg-transparent
            autofill:text-foreground
          "
        />

        {/* Password visibility */}
        {type === "password" && onTogglePassword && (
          <button
            type="button"
            onClick={onTogglePassword}
            className="
              shrink-0
              text-muted-foreground
              transition-colors
              hover:text-foreground
            "
          >
            {showPassword ? (
              <EyeOff size={17} />
            ) : (
              <Eye size={17} />
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default AuthInput;