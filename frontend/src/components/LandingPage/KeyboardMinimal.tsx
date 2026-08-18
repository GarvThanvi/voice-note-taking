import { CircleCheck } from "lucide-react";
import Container from "../ui/Container";
import Keyboard from "../ui/Keyboard";

const KeyboardMinimal = () => {
  const features = [
    "Clean and distraction-free interface",
    "iCloud sync across all your devices",
    "Offline first. Your data, always yours",
    "Blazing fast and lightweight",
  ];

  return (
    <section className="w-full border-t border-border-subtle bg-background py-20 sm:py-24">
      <Container>
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left Content */}
          <div>
            <div className="mb-8">
              <h2 className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
                Minimal by design.
                <br />
                <span className="text-primary">Powerful</span> in every way.
              </h2>
            </div>

            <div className="space-y-5">
              {features.map((text) => (
                <div
                  key={text}
                  className="flex items-center gap-3"
                >
                  <CircleCheck
                    size={20}
                    strokeWidth={1.8}
                    className="shrink-0 text-primary"
                  />

                  <p className="text-sm text-muted sm:text-base">
                    {text}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right Keyboard */}
          <div className="relative">
            {/* Glow behind keyboard */}
            <div
              className="
                absolute
                left-1/2
                top-1/2
                h-40
                w-3/4
                -translate-x-1/2
                -translate-y-1/2
                rounded-full
                bg-primary/10
                blur-[100px]
              "
            />

            <div className="relative">
              <Keyboard />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};

export default KeyboardMinimal;