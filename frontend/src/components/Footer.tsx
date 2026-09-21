import Container from "./ui/Container";
import Reveal from "./ui/Reveal";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="w-full border-t border-border-subtle bg-background">
      <Container>
        <Reveal
          margin="0px"
          className="flex flex-col items-center justify-between gap-4 py-6 sm:flex-row"
        >
          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} NoteFlow. All rights reserved.
          </p>

          {/* Legal links */}
          <div className="flex items-center gap-6 text-sm">
            <Link
              to="/privacy"
              className="
                text-muted-foreground
                transition-colors duration-200
                hover:text-foreground
              "
            >
              Privacy Policy
            </Link>

            <span className="h-4 w-px bg-border-subtle" />

            <Link
              to="/terms"
              className="
                text-muted-foreground
                transition-colors duration-200
                hover:text-foreground
              "
            >
              Terms of Service
            </Link>
          </div>
        </Reveal>
      </Container>
    </footer>
  );
};

export default Footer;