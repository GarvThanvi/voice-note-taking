import {
  Mic,
  PencilLine,
  Search,
  ListTodo,
} from "lucide-react";
import { motion } from "framer-motion";
import Container from "../ui/Container";
import Badge from "../ui/Badge";
import Reveal from "../ui/Reveal";

const EASE: [number, number, number, number] = [0.21, 0.47, 0.32, 0.98];

const features = [
  {
    icon: Mic,
    title: "Voice Notes",
    description: "Speak naturally and we'll take care of the rest.",
  },
  {
    icon: PencilLine,
    title: "Smart Edit",
    description: "Update, delete, or append notes using your voice.",
  },
  {
    icon: Search,
    title: "Find Anything",
    description: "Search your notes or ask and we'll find it.",
  },
  {
    icon: ListTodo,
    title: "Tasks & Lists",
    description: "Create checklists and stay on track.",
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: EASE },
  },
};

const Features = () => {
  return (
    <section id="features-section" className="relative w-full border-t border-border-subtle bg-background py-12">
      {/* Ambient glow behind heading */}
      <div
        aria-hidden
        className="animate-glow-pulse pointer-events-none absolute left-1/2 top-10 h-40 w-[32rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
      />

      <Container>
        <div className="flex flex-col items-center">
          {/* Voice First Heading Section */}
          <Reveal className="flex flex-col items-center text-center">
            <Badge>VOICE FIRST</Badge>

            <h2 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
              Think it. Say it.{" "}
              <span className="text-primary">Done.</span>
            </h2>

            <p className="mt-3 text-sm text-muted sm:text-base">
              Use your voice to create, edit, and organize notes instantly.
            </p>
          </Reveal>

          {/* Feature Cards */}
          <motion.div
            className="mt-10 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={{
              hidden: {},
              visible: {
                transition: { staggerChildren: 0.08, delayChildren: 0.1 },
              },
            }}
          >
            {features.map((feature) => {
              const Icon = feature.icon;

              return (
                <motion.div
                  key={feature.title}
                  variants={cardVariants}
                  className="group rounded-card border border-border bg-surface p-4 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:bg-surface-elevated hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                >
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-background">
                    <Icon
                      size={26}
                      strokeWidth={1.8}
                      className="text-primary"
                    />
                  </div>

                  <h3 className="text-base font-semibold text-foreground">
                    {feature.title}
                  </h3>

                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {feature.description}
                  </p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </Container>
    </section>
  );
};

export default Features;