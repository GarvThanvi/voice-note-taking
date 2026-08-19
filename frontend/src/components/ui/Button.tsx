import React from "react";

interface ButtonProps {
  children: React.ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  variant?: "primary" | "secondary";
}

const Button = ({
  children,
  className = "",
  type = "button",
  disabled = false,
  variant = "primary",
}: ButtonProps) => {
  const baseStyles = `
    inline-flex
    items-center
    justify-center
    gap-2
    rounded-button
    px-5
    py-2.5
    text-sm
    font-medium
    transition-all
    duration-200
    disabled:cursor-not-allowed
    disabled:opacity-50
  `;

  const variants = {
    primary: `
      bg-gradient-to-r
      from-primary
      via-primary-soft
      to-primary-dark
      text-white
      shadow-[0_4px_20px_rgba(255,64,88,0.2)]
      hover:-translate-y-0.5
      hover:shadow-[0_6px_25px_rgba(255,64,88,0.3)]
      active:translate-y-0
    `,

    secondary: `
      border
      border-border
      bg-transparent
      text-foreground
      hover:border-primary/40
      hover:bg-surface-elevated
    `,
  };

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export default Button;