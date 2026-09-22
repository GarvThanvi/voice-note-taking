import { Link } from "react-router-dom";
import Button from "../ui/Button";
import Container from "../ui/Container";
import Reveal from "../ui/Reveal";

const SimplifyNotes = () => {
  return (
    <section className="relative w-full bg-background pt-2 pb-12">
      <div
        aria-hidden
        className="
          pointer-events-none
          absolute
          left-1/2
          top-1/2
          h-80
          w-80
          -translate-x-1/2
          -translate-y-1/2
          rounded-full
          bg-primary/10
          blur-[120px]
        "
      />
      <Container>
        <Reveal>
          <div className="relative z-10 flex flex-col items-center">
            <div className="flex flex-col items-center text-center">
              <h2 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
                Ready to simplify <br /> your notes?
              </h2>

              <p className="mb-4 mt-3 text-sm text-muted sm:text-base">
                Think, Speak and get things done with NoteFlow.
              </p>
              <Link to="/signin">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
};

export default SimplifyNotes;