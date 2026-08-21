import { useState } from "react";
import Container from "../components/ui/Container";
import AuthForm, { type AuthMode } from "../components/LoginSignup/AuthForm";

const LoginSignup = () => {
  const [mode, setMode] = useState<AuthMode>("login");

  return (
    <main
      className="
        relative
        min-h-[calc(100vh-140px)]
        overflow-hidden
        bg-background
        -top-7
      "
    >
      {/* Top-right glow */}
      <div
        className="
          pointer-events-none
          absolute
          -right-32
          top-20
          h-72
          w-72
          rounded-full
          bg-primary/5
          blur-3xl
          animate-breathe
        "
      />

      {/* Bottom-left glow */}
      <div
        className="
          pointer-events-none
          absolute
          -bottom-32
          -left-32
          h-72
          w-72
          rounded-full
          bg-primary-dark/5
          blur-3xl
          animate-glow-pulse
        "
      />

      {/* Decorative diagonal lines */}
      <div
        className="
          pointer-events-none
          absolute
          right-[-100px]
          top-[20%]
          h-[280px]
          w-[500px]
          rotate-[-35deg]
          opacity-30
        "
      >
        <div className="absolute right-0 top-0 h-3 w-full bg-gradient-to-r from-transparent via-primary-dark/20 to-primary/50 blur-sm" />

        <div className="absolute right-[-30px] top-14 h-2 w-full bg-gradient-to-r from-transparent via-primary-dark/20 to-primary/60 blur-sm" />

        <div className="absolute right-[-60px] top-28 h-2 w-full bg-gradient-to-r from-transparent via-primary-dark/20 to-primary/40 blur-sm" />
      </div>

      <Container>
        <div className="flex min-h-[calc(100vh-140px)] items-center justify-center py-12 sm:py-16">
          <div className="w-full max-w-[620px] flex items-center justify-center">
            {/* Auth card */}
            <div
              className="
                relative
                overflow-hidden
                rounded-card
                border
                border-border
                bg-surface
                px-6
                py-8
                shadow-[0_20px_70px_rgba(0,0,0,0.35)]
                sm:px-12
                sm:py-10
                w-[480px]
              "
            >
              {/* Subtle card glow */}
              <div
                className="
                  pointer-events-none
                  absolute
                  left-1/2
                  top-0
                  h-32
                  w-64
                  -translate-x-1/2
                  rounded-full
                  bg-primary/5
                  blur-3xl
                "
              />

              <div className="relative">
                {/* Logo */}
                {/* <div className="mb-8 flex justify-center">
                  <div className="flex items-center gap-2">
                    <AudioWaveform
                      size={30}
                      strokeWidth={2}
                      className="text-primary"
                    />

                    <span className="text-xl font-semibold tracking-tight text-foreground">
                      NoteFlow
                    </span>
                  </div>
                </div> */}

                {/* Form */}
                <AuthForm mode={mode} onModeChange={setMode} />
              </div>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
};

export default LoginSignup;
