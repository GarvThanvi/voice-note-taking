import { Command, ArrowUp } from "lucide-react";
import { motion } from "framer-motion";

import Container from "../ui/Container";
import Badge from "../ui/Badge";
import Reveal from "../ui/Reveal";

const EASE: [number, number, number, number] = [0.21, 0.47, 0.32, 0.98];

const shortcuts = [
  {
    keys: [
      { type: "icon", value: "command" },
      { type: "text", value: "N" },
    ],
    label: "New Note",
  },
  {
    keys: [
      { type: "icon", value: "command" },
      { type: "text", value: "F" },
    ],
    label: "Search",
  },
  {
    keys: [
      { type: "icon", value: "command" },
      { type: "icon", value: "shift" },
      { type: "text", value: "D" },
    ],
    label: "Dictation",
  },
  {
    keys: [
      { type: "icon", value: "command" },
      { type: "icon", value: "shift" },
      { type: "text", value: "K" },
    ],
    label: "Quick Capture",
  },
  {
    keys: [{ type: "text", value: "esc" }],
    label: "Stop Voice",
  },
];

const shortcutVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

const Shortcuts = () => {
  return (
    <section id="shortcuts-section" className="w-full border-t border-border-subtle bg-background py-12">
      <Container>
        <div className="flex flex-col items-center">
          {/* Heading */}
          <Reveal className="flex flex-col items-center text-center">
            <Badge>SHORTCUTS</Badge>

            <h2 className="mt-4 text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
              Everything at your{" "}
              <span className="text-primary">fingertips.</span>
            </h2>

            <p className="mt-3 text-sm text-muted sm:text-base">
              Powerful shortcuts to keep your flow uninterrupted.
            </p>
          </Reveal>

          {/* Shortcuts */}
          <motion.div
            className="mt-10 grid w-full grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-5"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={{
              hidden: {},
              visible: {
                transition: { staggerChildren: 0.09, delayChildren: 0.1 },
              },
            }}
          >
            {shortcuts.map((shortcut) => (
              <motion.div
                key={shortcut.label}
                variants={shortcutVariants}
                className="flex flex-col items-center gap-3"
              >
                {/* Keyboard Keys */}
                <div className="flex items-center">
                  {shortcut.keys.map((key, index) => (
                    <div
                      key={index}
                      className={`
                        flex h-14 min-w-14 items-center justify-center
                        border border-border-subtle
                        bg-background px-4
                        text-xl font-medium text-foreground
                        shadow-[0_0_14px_color-mix(in_srgb,var(--color-primary)_14%,transparent)]
                        transition-all duration-200
                        hover:-translate-y-1
                        hover:border-primary/30
                        hover:shadow-[0_0_18px_color-mix(in_srgb,var(--color-primary)_22%,transparent)]
                        active:translate-y-0
                        ${index === 0 ? "rounded-l-lg" : ""}
                        ${index === shortcut.keys.length - 1 ? "rounded-r-lg" : ""}
                        ${index !== 0 ? "-ml-px" : ""}
                      `}
                    >
                      {key.type === "icon" && key.value === "command" && (
                        <Command size={23} strokeWidth={2} />
                      )}

                      {key.type === "icon" && key.value === "shift" && (
                        <ArrowUp size={23} strokeWidth={2} />
                      )}

                      {key.type === "text" && key.value}
                    </div>
                  ))}
                </div>

                {/* Label */}
                <p className="text-sm text-muted">{shortcut.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </Container>
    </section>
  );
};

export default Shortcuts;