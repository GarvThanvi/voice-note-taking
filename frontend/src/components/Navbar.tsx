import { NavLink } from "react-router-dom";
import { AudioWaveform } from "lucide-react";
import { motion } from "framer-motion";
import Container from "./ui/Container";

const EASE: [number, number, number, number] = [0.21, 0.47, 0.32, 0.98];

const Navbar = () => {
  const navLinks = [
    { name: "Features", path: "/features" },
    { name: "Voice", path: "/voice" },
    { name: "Shortcuts", path: "/shortcuts" },
    { name: "About", path: "/about" },
    { name: "Download", path: "/downloads" },
  ];

  return (
    <motion.nav
      className="sticky top-0 z-50 w-full py-4"
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <Container>
        <div className="relative flex h-16 items-center justify-between rounded-xl border border-border bg-surface/70 px-6 shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-2.5">
            <AudioWaveform
              size={21}
              strokeWidth={2}
              className="text-primary"
            />

            <span className="text-base font-semibold text-foreground">
              NoteFlow
            </span>
          </NavLink>

          {/* Navigation */}
          <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-9">
            {navLinks.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                className={({ isActive }) =>
                  `text-sm transition-colors duration-200 ${
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`
                }
              >
                {link.name}
              </NavLink>
            ))}
          </div>

          {/* CTA */}
          <NavLink
            to="/login"
            className="flex items-center gap-2 rounded-button bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_rgba(255,64,88,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-[0_6px_20px_rgba(255,64,88,0.35)]"
          >
            Login/Signup
          </NavLink>
        </div>
      </Container>
    </motion.nav>
  );
};

export default Navbar;