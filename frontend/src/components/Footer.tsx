import Container from "./ui/Container";

const Footer = () => {
  return (
    <footer className="w-full border-t border-border-subtle bg-background py-8">
      <Container>
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="text-sm text-muted">© {new Date().getFullYear()} NoteFlow</span>
          <span className="text-sm text-muted-foreground">
            Think it. Say it. Done.
          </span>
        </div>
      </Container>
    </footer>
  );
};

export default Footer;
