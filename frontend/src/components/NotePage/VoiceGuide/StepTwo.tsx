import {
  Archive,
  Check,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface VoiceExample {
  icon: LucideIcon;
  title: string;
  example: string;
}

const VOICE_EXAMPLES: VoiceExample[] = [
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

const IconChip = ({ icon: Icon }: { icon: LucideIcon }) => (
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
);

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
        {VOICE_EXAMPLES.map(({ icon, title, example }) => (
          <div
            key={title}
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
            <IconChip icon={icon} />

            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold leading-tight text-foreground">
                {title}
              </h3>

              <p className="mt-1 text-[11px] leading-[1.5] text-muted">
                “{example}”
              </p>
            </div>
          </div>
        ))}
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
        <IconChip icon={RotateCcw} />

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

export default StepTwo;
