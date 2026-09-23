import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { HashLink } from "react-router-hash-link";
import { AudioWaveform, Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Container from "./ui/Container";

const EASE: [number, number, number, number] = [0.21, 0.47, 0.32, 0.98];

const Navbar = () => {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  const navLinks = [
    {
      name: "Features",
      path: "/#features-section",
      matchingHash: "#features-section",
    },
    {
      name: "Shortcuts",
      path: "/#shortcuts-section",
      matchingHash: "#shortcuts-section",
    },
  ];

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };

    const onPointerDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [menuOpen]);

  return (
    <motion.nav
      className="sticky top-0 z-50 w-full py-4"
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
    >
      <Container>
        <div
          ref={navRef}
          className="relative flex h-16 items-center justify-between rounded-xl border border-border bg-surface/70 px-5 shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:px-6"
        >
          {/* Logo */}
          <NavLink
            to="/"
            onClick={() => setMenuOpen(false)}
            className="flex shrink-0 items-center gap-2.5"
          >
            <AudioWaveform size={21} strokeWidth={2} className="text-primary" />

            <span className="text-base font-semibold text-foreground">
              NoteFlow
            </span>
          </NavLink>

          {/* Navigation (desktop) */}
          <div className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 md:flex">
            {navLinks.map((link) => (
              <HashLink
                key={link.path}
                to={link.path}
                className={`text-sm transition-colors duration-200 ${
                  location.hash === link.matchingHash
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.name}
              </HashLink>
            ))}
          </div>

          {/* CTA (desktop) */}
          <NavLink
            to="/signin"
            className="hidden items-center gap-2 rounded-button bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_rgba(255,64,88,0.25)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-[0_6px_20px_rgba(255,64,88,0.35)] md:flex"
          >
            Login/Signup
          </NavLink>

          {/* Menu toggle (mobile) */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-button text-muted-foreground transition-colors duration-200 hover:bg-surface-elevated hover:text-foreground md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav-menu"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          {/* Menu panel (mobile) */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                id="mobile-nav-menu"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: EASE }}
                className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-xl border border-border bg-surface/95 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-xl md:hidden"
              >
                <nav className="flex flex-col">
                  {navLinks.map((link) => (
                    <HashLink
                      key={link.path}
                      to={link.path}
                      onClick={() => setMenuOpen(false)}
                      className={`rounded-button px-4 py-3 text-sm transition-colors duration-200 ${
                        location.hash === link.matchingHash
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {link.name}
                    </HashLink>
                  ))}

                  <div className="my-2 h-px bg-border-subtle" />

                  <NavLink
                    to="/signin"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-button bg-primary px-5 py-3 text-sm font-medium text-white shadow-[0_4px_16px_rgba(255,64,88,0.25)] transition-all duration-200 hover:bg-primary-hover hover:shadow-[0_6px_20px_rgba(255,64,88,0.35)]"
                  >
                    Login/Signup
                  </NavLink>
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Container>
    </motion.nav>
  );
};

export default Navbar;
