import { NavLink } from "react-router-dom";
import { AudioWaveform } from "lucide-react";
import Container from "./ui/Container";

const Navbar = () => {
  const navLinks = [
    { name: "Features", path: "/features" },
    { name: "Voice", path: "/voice" },
    { name: "Shortcuts", path: "/shortcuts" },
    { name: "About", path: "/about" },
    { name: "Download", path: "/downloads" },
  ];

  return (
    <nav className="w-full py-5">
      <Container>
        <div className="relative flex h-16 items-center justify-between rounded-xl border border-white/10 bg-[#08090b] px-6">
        
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2.5">
          <AudioWaveform
            size={21}
            strokeWidth={2}
            className="text-red-500"
          />

          <span className="text-base font-semibold text-white">
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
                `text-sm transition-colors ${
                  isActive
                    ? "text-white"
                    : "text-white"
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
          className="flex items-center gap-2 rounded-lg bg-[#f4d8e4] px-5 py-2.5 text-sm font-medium text-black transition hover:bg-[#f7e3eb]"
        >
          Login/Signup
        </NavLink>
        </div>
      </Container>
    </nav>
  );
};

export default Navbar;