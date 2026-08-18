import { Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Container from "../ui/Container";
import Reveal from "../ui/Reveal";

const DICTATION_LINES = [
  "Add olive oil to the shopping list for Saturday",
  "Remind me to call the dentist tomorrow at 10am",
  "Create a task: water the plants tonight",
];

const TYPE_SPEED = 40;
const PAUSE_AFTER_LINE = 1900;

const formatTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const Dictation = () => {
  const reducedMotion = useReducedMotion();
  const [text, setText] = useState("");
  const [lineIndex, setLineIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const displayed = reducedMotion ? DICTATION_LINES[0] : text;

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion) return;
    const current = DICTATION_LINES[lineIndex];
    const timeout =
      text.length < current.length
        ? window.setTimeout(
            () => setText(current.slice(0, text.length + 1)),
            TYPE_SPEED,
          )
        : window.setTimeout(() => {
            setLineIndex((i) => (i + 1) % DICTATION_LINES.length);
            setText("");
          }, PAUSE_AFTER_LINE);
    return () => window.clearTimeout(timeout);
  }, [text, lineIndex, reducedMotion]);

  return (
    <div className="mx-auto mt-14 w-full max-w-lg rounded-card border border-border bg-surface p-6 text-left shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="animate-pulse h-2 w-2 rounded-full bg-primary"
          />
          <span className="text-xs font-medium text-muted">Recording</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatTime(seconds)}
        </span>
      </div>

      {/* Live dictation */}
      <div
        aria-live="off"
        className="flex min-h-[4.5rem] items-start py-5 text-base leading-relaxed text-foreground sm:text-lg"
      >
        <span className="mr-1 select-none text-muted-foreground">&ldquo;</span>
        <span>{displayed}</span>
        <span
          aria-hidden
          className="animate-pulse ml-1 mt-1 inline-block h-5 w-[2px] bg-foreground/80"
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border-subtle pt-3">
        <div className="relative flex h-9 w-9 items-center justify-center">
          <span
            aria-hidden
            className="animate-ring-pulse absolute inset-0 rounded-full bg-primary/25"
          />
          <span
            aria-hidden
            className="animate-ring-pulse absolute inset-0 rounded-full bg-primary/20"
            style={{ animationDelay: "1s" }}
          />
          <button
            type="button"
            aria-label="Recording in progress"
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white shadow-[0_0_20px_rgba(255,64,88,0.4)]"
          >
            <Mic size={16} strokeWidth={2} />
          </button>
        </div>

        <span className="text-xs text-muted-foreground">⌘D to dictate</span>
      </div>
    </div>
  );
};

const Hero = () => {
  return (
    <section className="relative w-full overflow-hidden bg-background pb-20 pt-8 sm:pb-28 sm:pt-12">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="animate-glow-pulse pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[38rem] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[140px]"
      />

      <Container>
        <div className="relative flex flex-col items-center text-center">
          <Reveal>
            <Badge variant="primary">VOICE-FIRST NOTES</Badge>
          </Reveal>

          <Reveal delay={0.05}>
            <h1 className="mt-4 max-w-3xl text-4xl font-medium tracking-tight text-foreground sm:text-6xl">
              Talk. <span className="text-primary">It&rsquo;s noted.</span>
            </h1>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Your words become clean, organized notes &mdash; instantly.
              Create, edit, search, and manage everything by voice.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
              <Link to="/login">
                <Button>Get Started</Button>
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-button border border-border px-6 py-2.5 text-base font-medium text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-surface"
              >
                See how it works
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.25} className="w-full">
            <Dictation />
          </Reveal>
        </div>
      </Container>
    </section>
  );
};

export default Hero;