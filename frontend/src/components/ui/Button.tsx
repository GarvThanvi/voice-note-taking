import React from "react";

interface ButtonProps {
  children: React.ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

const Button = ({
  children,
  className = "",
  type = "button",
  disabled = false,
}: ButtonProps) => {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center gap-2
        rounded-button
        bg-gradient-to-r
        from-[#ff304c]
        via-[#f95f73]
        to-[#b96b91]
        px-5 py-2.5
        text-base font-medium
        text-white
        shadow-[0_4px_20px_rgba(255,64,88,0.2)]
        transition-all duration-200
        hover:-translate-y-0.5
        hover:shadow-[0_6px_25px_rgba(255,64,88,0.3)]
        active:translate-y-0
        disabled:cursor-not-allowed
        disabled:opacity-50
        ${className}
      `}
    >
      {children}
    </button>
  );
};

export default Button;