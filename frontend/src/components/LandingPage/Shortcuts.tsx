import Container from "../ui/Container";
import Badge from "../ui/Badge";

const Shortcuts = () => {
  return (
    <section className="w-full border-t border-border-subtle bg-background py-12">
      <Container>
        <div className="flex flex-col items-center">

        {/* Voice First Heading Section */}
        <div className="flex flex-col items-center text-center">

          <Badge>SHORTCUTS</Badge>

          <h2 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
            Everything at your{" "}
            <span className="text-primary">fingertips.</span>
          </h2>

          <p className="mt-3 text-sm text-muted sm:text-base">
            Powerful shortcuts to keep your flow uninterrupted.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          
        </div>

        </div>
      </Container>
    </section>
  );
};

export default Shortcuts;