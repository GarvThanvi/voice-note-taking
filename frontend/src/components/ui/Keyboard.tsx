import type { ReactNode } from "react";

interface KeyProps {
  children: ReactNode;
  topLabel?: ReactNode;
  width?: string;
  highlighted?: boolean;
}

const Key = ({
  children,
  topLabel,
  width = "flex-1",
  highlighted = false,
}: KeyProps) => {
  return (
    <div
      className={`
        ${width}
        relative
        flex
        h-10
        flex-col
        items-center
        justify-center
        gap-0.5
        rounded-[6px]
        border
        text-[9px]
        font-medium
        leading-none
        transition-all
        duration-200

        sm:h-11
        sm:rounded-[7px]
        sm:text-[10px]

        ${
          highlighted
            ? `
              border-primary
              bg-primary/10
              text-primary
              shadow-[0_0_10px_rgba(255,64,88,0.35)]
            `
            : `
              border-[#24272a]
              bg-[#0b0d0f]
              text-[#66686b]
              shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_2px_3px_rgba(0,0,0,0.7)]
            `
        }
      `}
    >
      {topLabel ? (
        <span className="text-[7px] opacity-50 sm:text-[8px]">
          {topLabel}
        </span>
      ) : null}
      <span>{children}</span>
    </div>
  );
};

const Keyboard = () => {
  return (
    <div className="relative w-full">
      {/* Outer red glow */}
      <div
        className="
          absolute
          -inset-[2px]
          rounded-[18px]
          bg-primary/20
          opacity-70
          blur-[12px]
        "
      />

      {/* Keyboard body */}
      <div
        className="
          relative
          rounded-[16px]
          border
          border-[#303033]
          bg-[#08090a]
          p-2.5
          shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_12px_35px_rgba(0,0,0,0.6)]

          sm:p-3
        "
      >
        {/* Top row: esc + combined function/number keys */}
        <div className="mb-1.5 flex gap-1.5 sm:gap-2">
          <Key width="w-[7.5%]" highlighted>
            esc
          </Key>

          <Key topLabel="⌵">1</Key>
          <Key topLabel="☀">2</Key>
          <Key topLabel="☀">3</Key>
          <Key topLabel="♪">4</Key>
          <Key topLabel="🔍">5</Key>
          <Key topLabel="▭">6</Key>
          <Key topLabel="◀︎▶︎">7</Key>
          <Key topLabel="⏵">8</Key>
          <Key topLabel="🔇">9</Key>
          <Key topLabel="🔉">0</Key>
          <Key topLabel="🔊">-</Key>
        </div>

        {/* QWERTY row */}
        <div className="mb-1.5 flex gap-1.5 sm:gap-2">
          <Key width="w-[7.5%]">tab</Key>

          <Key>Q</Key>
          <Key>W</Key>
          <Key>E</Key>
          <Key>R</Key>
          <Key>T</Key>
          <Key>Y</Key>
          <Key>U</Key>
          <Key>I</Key>
          <Key>O</Key>
          <Key>P</Key>
        </div>

        {/* Home row */}
        <div className="mb-1.5 flex gap-1.5 sm:gap-2">
          <Key width="w-[9%]">caps lock</Key>

          <Key>A</Key>
          <Key>S</Key>
          <Key>D</Key>
          <Key>F</Key>
          <Key>G</Key>

          <Key>H</Key>

          <Key>J</Key>
          <Key>K</Key>
          <Key>L</Key>
        </div>

        {/* Shift row */}
        <div className="mb-1.5 flex gap-1.5 sm:gap-2">
          <Key width="w-[11%]">shift</Key>

          <Key>Z</Key>
          <Key>X</Key>
          <Key>C</Key>
          <Key>V</Key>
          <Key>B</Key>

          <Key highlighted>N</Key>

          <Key>M</Key>
          <Key>,</Key>
          <Key>.</Key>
          <Key>/</Key>
        </div>

        {/* Bottom row */}
        <div className="flex gap-1.5 sm:gap-2">
          <Key width="w-[6%]">⏻</Key>
          <Key width="w-[8%]">control</Key>
          <Key width="w-[8%]">option</Key>
          <Key width="w-[10%]">⌘</Key>

          <Key width="flex-1">space</Key>

          <Key width="w-[10%]">⌘</Key>
          <Key width="w-[8%]">option</Key>
        </div>
      </div>
    </div>
  );
};

export default Keyboard;