import Button from "../ui/Button";
import Container from "../ui/Container";

const SimplifyNotes = () => {
  return (
    <section className="w-full border-t border-border-subtle bg-background py-12">
      <Container>
        <div className="flex flex-col items-center">
          <div className="flex flex-col items-center text-center">
            <h2 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
                Ready to simplify <br/> your notes?
            </h2>

            <p className="mt-3 text-sm text-muted sm:text-base mb-4">
              Think, Speak and get things done with NoteFlow.
            </p>
            <Button>Get Started</Button>
          </div>
        </div>
      </Container>
    </section>
  );
};

export default SimplifyNotes;
