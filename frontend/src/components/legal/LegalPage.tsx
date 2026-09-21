import type { ReactNode } from "react";
import Container from "../ui/Container";
import Reveal from "../ui/Reveal";

export interface LegalSection {
  title: string;
  body: ReactNode;
}

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
}

const LegalPage = ({ title, lastUpdated, intro, sections }: LegalPageProps) => {
  return (
    <section className="w-full py-16 sm:py-20">
      <Container>
        <div className="mx-auto max-w-3xl">
          {/* Header */}
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
              Legal
            </p>

            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>

            <p className="mt-2 text-sm text-muted-foreground">
              Last updated: {lastUpdated}
            </p>

            <p className="mt-6 text-sm leading-6 text-muted sm:text-base">
              {intro}
            </p>
          </Reveal>

          {/* Sections */}
          <div className="mt-10 flex flex-col gap-5">
            {sections.map((section, index) => (
              <Reveal key={section.title} delay={Math.min(index * 0.04, 0.2)}>
                <div
                  className="
                    rounded-card
                    border border-border-subtle
                    bg-surface
                    p-6 sm:p-8
                  "
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-sm font-semibold text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <h2 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                      {section.title}
                    </h2>
                  </div>

                  <div className="mt-4 text-sm leading-6 text-muted sm:text-[15px]">
                    {section.body}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
};

export default LegalPage;
