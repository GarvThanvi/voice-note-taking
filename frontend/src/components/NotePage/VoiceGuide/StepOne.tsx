import { ArrowRight, Check, Mic } from "lucide-react";
import StatusPill from "../../ui/StatusPill";

interface GuideStep {
  title: string;
  description: string;
}

const GUIDE_STEPS: GuideStep[] = [
  {
    title: "Open the mic",
    description: "Hold the mouse on the mic icon or hold Ctrl + Space",
  },
  {
    title: "Speak naturally",
    description: "Just tell us what you want to do",
  },
  {
    title: "See it added",
    description: "Your note or todo will be created automatically.",
  },
];

const GuideStepItem = ({
  index,
  title,
  description,
}: GuideStep & { index: number }) => {
  const active = index === 0;

  return (
    <div className="flex gap-3">
      <div
        className={`
          flex
          h-[40px]
          w-[40px]
          shrink-0
          items-center
          justify-center
          rounded-full
          text-[13px]
          ${
            active
              ? "bg-primary font-semibold text-white shadow-[0_0_18px_rgba(255,64,88,0.25)]"
              : "border border-border bg-surface font-medium text-muted"
          }
        `}
      >
        {index + 1}
      </div>

      <div className="min-w-0 pt-1">
        <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>

        <p className="mt-1 text-[12px] leading-[1.45] text-muted">
          {description}
        </p>
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
          {GUIDE_STEPS.map((step, index) => (
            <div key={step.title}>
              {index > 0 && (
                <div className="ml-[19px] h-6 w-px border-l border-border" />
              )}

              <GuideStepItem
                index={index}
                title={step.title}
                description={step.description}
              />
            </div>
          ))}
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
            <StatusPill label="Listening..." size="bare" />

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

export default StepOne;
