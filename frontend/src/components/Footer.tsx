import Container from "./ui/Container";

const Footer = () => {
  return (
    <footer className="w-full border-t border-border-subtle bg-background">
      <Container>
        <div className="flex flex-col items-center justify-between gap-4 py-6 sm:flex-row">
          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} NoteFlow. All rights reserved.
          </p>

          {/* Legal links */}
          <div className="flex items-center gap-6 text-sm">
            <a
              href="#"
              className="
                text-muted-foreground
                transition-colors duration-200
                hover:text-foreground
              "
            >
              Privacy Policy
            </a>

            <span className="h-4 w-px bg-border-subtle" />

            <a
              href="#"
              className="
                text-muted-foreground
                transition-colors duration-200
                hover:text-foreground
              "
            >
              Terms of Service
            </a>
          </div>
        </div>
      </Container>
    </footer>
  );
};

export default Footer;