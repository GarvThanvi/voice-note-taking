import { Fragment } from "react";
import {
  Archive,
  FileText,
  ListChecks,
  Search,
  Zap,
  ShieldCheck,
  Monitor,
  ArrowRight,
} from "lucide-react";

import Container from "../ui/Container";
import Badge from "../ui/Badge";
import Reveal from "../ui/Reveal";

const commands = [
  {
    icon: FileText,
    text: "Create a note about my meeting tomorrow",
  },
  {
    icon: ListChecks,
    text: "Add buy groceries to my todo list",
  },
  {
    icon: Search,
    text: "Find my notes about system design",
  },
  {
    icon: Archive,
    text: "Archive my old travel notes",
  },
];

const benefits = [
  {
    icon: Zap,
    title: "Fast",
    description: "Capture your thoughts instantly",
  },
  {
    icon: ShieldCheck,
    title: "Private",
    description: "Your notes stay yours",
  },
  {
    icon: Monitor,
    title: "Works everywhere",
    description: "Capture from any device",
  },
];

const KeyboardMinimal = () => {
  return (
    <section className="w-full bg-background pt-6 pb-10 sm:pt-8 sm:pb-12">
      <Container>
        <Reveal>
          <div
            className="
              relative overflow-hidden
              px-6 pt-8 pb-14
              sm:px-10 sm:pt-10 sm:pb-16
              lg:px-14 lg:pt-12 lg:pb-20
            "
          >
            {/* Background glow */}
            <div
              aria-hidden
              className="
                pointer-events-none
                absolute
                left-1/2
                top-1/2
                h-96
                w-96
                -translate-x-1/2
                -translate-y-1/2
                rounded-full
                bg-primary/5
                blur-[120px]
              "
            />

            <div className="relative z-10 flex flex-col items-center">
              {/* Badge */}
              <Badge>NATURAL COMMANDS</Badge>

              {/* Heading */}
              <h2 className="mt-5 max-w-2xl text-center text-3xl font-medium tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                Speak naturally.{" "}
                <span className="text-primary">
                  Get things done.
                </span>
              </h2>

              {/* Description */}
              <p className="mt-4 max-w-xl text-center text-sm leading-6 text-muted sm:text-base">
                Use natural language to capture, search, organise, and
                manage your notes. Just say what you need.
              </p>

              {/* Benefits */}
              <div className="mt-10 flex w-full max-w-3xl flex-col items-center justify-center gap-6 sm:flex-row sm:gap-8">
                {benefits.map((benefit, index) => {
                  const Icon = benefit.icon;

                  return (
                    <Fragment key={benefit.title}>
                      <div
                        className="
                          flex
                          w-full
                          items-center
                          justify-start
                          gap-3
                          sm:flex-1
                          sm:justify-center
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
                            rounded-full
                            border
                            border-primary/20
                            bg-primary/5
                          "
                        >
                          <Icon
                            size={18}
                            strokeWidth={1.8}
                            className="text-primary"
                          />
                        </div>

                        <div className="text-left">
                          <p className="text-sm font-medium text-foreground">
                            {benefit.title}
                          </p>

                          <p className="mt-0.5 text-xs text-muted">
                            {benefit.description}
                          </p>
                        </div>
                      </div>

                      {index !== benefits.length - 1 && (
                        <div className="hidden h-8 w-px shrink-0 bg-border-subtle sm:block" />
                      )}
                    </Fragment>
                  );
                })}
              </div>

              {/* Example Commands */}
              <div className="mt-14 w-full max-w-3xl">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted">
                    Example commands
                  </p>

                  <span className="hidden text-xs text-primary sm:block">
                    Just say it →
                  </span>
                </div>

                <div className="space-y-3">
                  {commands.map((command, index) => {
                    const Icon = command.icon;

                    return (
                      <Reveal
                        key={command.text}
                        delay={index * 0.08}
                      >
                        <div
                          className="
                            group
                            flex
                            items-center
                            gap-4
                            rounded-xl
                            border
                            border-border-subtle
                            bg-background/60
                            px-4
                            py-4
                            transition-all
                            duration-200
                            hover:border-primary/25
                            hover:bg-surface-elevated
                          "
                        >
                          {/* Icon */}
                          <div
                            className="
                              flex
                              h-9
                              w-9
                              shrink-0
                              items-center
                              justify-center
                              rounded-lg
                              border
                              border-border
                              bg-surface-elevated
                            "
                          >
                            <Icon
                              size={17}
                              strokeWidth={1.8}
                              className={
                                index === 1
                                  ? "text-primary"
                                  : "text-muted"
                              }
                            />
                          </div>

                          {/* Command */}
                          <p className="flex-1 text-left text-sm text-muted sm:text-base">
                            "{command.text}"
                          </p>

                          {/* Arrow */}
                          <ArrowRight
                            size={17}
                            className="
                              shrink-0
                              text-muted-foreground
                              transition-all
                              duration-200
                              group-hover:translate-x-1
                              group-hover:text-primary
                            "
                          />
                        </div>
                      </Reveal>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
};

export default KeyboardMinimal;