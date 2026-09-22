import { Mic, Circle } from "lucide-react";
import { motion } from "framer-motion";

import Container from "../ui/Container";
import Badge from "../ui/Badge";
import Reveal from "../ui/Reveal";

const EASE: [number, number, number, number] = [0.21, 0.47, 0.32, 0.98];

const waveformBars = [
  18, 28, 42, 25, 55, 36, 70, 48, 32, 62, 42, 76, 50, 30, 58, 38, 24, 45,
  28,
];

const Shortcuts = () => {
  return (
    <section
      id="shortcuts-section"
      className="w-full bg-background py-16 sm:py-20"
    >
      <Container>
        <Reveal>
          <div
            className="
              relative overflow-hidden rounded-2xl
              border border-border
              bg-surface
              px-6 py-10
              sm:px-10 sm:py-12
              lg:px-16 lg:py-14
            "
          >
            {/* Subtle background glow */}
            <div
              className="
                pointer-events-none absolute
                right-[-10%] top-1/2
                h-80 w-80
                -translate-y-1/2
                rounded-full
                bg-primary/10
                blur-[120px]
              "
            />

            <div className="relative z-10 grid items-center gap-12 lg:grid-cols-[1fr_0.9fr]">
              {/* Left Content */}
              <div className="max-w-xl">
                <Badge>VOICE FIRST</Badge>

                <h2 className="mt-5 text-3xl font-medium tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                  Just press{" "}
                  <span className="text-primary">and speak.</span>
                </h2>

                <p className="mt-4 max-w-lg text-sm leading-6 text-muted sm:text-base">
                  Hit Ctrl + K and start talking. Your thoughts are instantly
                  turned into notes, tasks, and everything you need.
                </p>

                {/* Shortcut */}
                {/* Shortcut */}
<div className="mt-8 flex flex-col items-start gap-3">
  {/* Keys */}
  <div className="flex items-center">
    <div
      className="
        flex h-14 min-w-20 items-center justify-center
        rounded-l-xl
        border border-border
        bg-surface-elevated
        px-5
        text-base font-medium
        text-foreground
        shadow-[0_0_20px_color-mix(in_srgb,var(--color-primary)_8%,transparent)]
      "
    >
      Ctrl
    </div>

    <div
      className="
        flex h-14 items-center justify-center
        border-y border-border
        bg-surface-elevated
        px-3
        text-sm
        text-muted
      "
    >
      +
    </div>

    <div
      className="
        flex h-14 min-w-14 items-center justify-center
        rounded-r-xl
        border border-border
        bg-surface-elevated
        px-4
        text-xl font-medium
        text-foreground
        shadow-[0_0_20px_color-mix(in_srgb,var(--color-primary)_8%,transparent)]
      "
    >
      K
    </div>
  </div>

  {/* Keyboard hint */}
  <div
    className="
      flex items-center gap-2
      rounded-full
      border border-border-subtle
      bg-surface-elevated/60
      px-3 py-1.5
    "
  >
    <Circle
      size={7}
      fill="currentColor"
      className="text-primary"
    />

    <span className="text-xs text-muted">
      Press Ctrl + K to start listening
    </span>
  </div>
</div>
              </div>

              {/* Right - Voice Visualizer */}
              <div className="relative flex min-h-[280px] items-center justify-center">
                {/* Outer rings */}
                <motion.div
                  className="
                    absolute h-64 w-64 rounded-full
                    border border-primary/10
                  "
                  animate={{
                    scale: [1, 1.08, 1],
                    opacity: [0.35, 0.7, 0.35],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />

                <motion.div
                  className="
                    absolute h-48 w-48 rounded-full
                    border border-primary/15
                  "
                  animate={{
                    scale: [1, 1.12, 1],
                    opacity: [0.4, 0.8, 0.4],
                  }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />

                {/* Waveform */}
                <div className="absolute flex items-center gap-1.5">
                  {waveformBars.map((height, index) => (
                    <motion.div
                      key={index}
                      className="w-1 rounded-full bg-primary/60"
                      animate={{
                        height: [
                          `${height * 0.45}px`,
                          `${height}px`,
                          `${height * 0.55}px`,
                        ],
                        opacity: [0.35, 0.8, 0.45],
                      }}
                      transition={{
                        duration: 1.1 + (index % 4) * 0.15,
                        repeat: Infinity,
                        repeatType: "mirror",
                        ease: "easeInOut",
                        delay: index * 0.04,
                      }}
                    />
                  ))}
                </div>

                {/* Microphone */}
                <motion.div
                  className="
                    relative z-10
                    flex h-24 w-24 items-center justify-center
                    rounded-full
                    border border-primary/40
                    bg-primary/15
                    shadow-[0_0_45px_color-mix(in_srgb,var(--color-primary)_30%,transparent)]
                  "
                  animate={{
                    scale: [1, 1.04, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <Mic
                    size={34}
                    strokeWidth={1.8}
                    className="text-primary"
                  />
                </motion.div>

                {/* Listening status */}
                <motion.div
                  className="
                    absolute bottom-2
                    flex items-center gap-2
                    rounded-full
                    border border-border
                    bg-surface-elevated
                    px-4 py-2
                    shadow-lg
                  "
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.3 }}
                >
                  <motion.span
                    animate={{ opacity: [1, 0.35, 1] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                    }}
                  >
                    <Circle
                      size={7}
                      fill="currentColor"
                      className="text-primary"
                    />
                  </motion.span>

                  <span className="text-xs text-muted">
                    Listening...
                  </span>
                </motion.div>
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
};

export default Shortcuts;