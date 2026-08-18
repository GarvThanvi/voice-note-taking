import { Mail } from "lucide-react";
import Button from "../ui/Button";
import Container from "../ui/Container";

const SubscribeMail = () => {
  return (
    <section className="w-full border-t border-border-subtle py-16 sm:py-20">
      <Container>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          {/* Content */}
          <div className="flex items-center gap-5">
            <div
              className="
                flex h-28 w-28 shrink-0 items-center justify-center
                rounded-full
                border border-primary/30
                bg-primary/5
                shadow-[0_0_35px_rgba(255,64,88,0.08)]
              "
            >
              <Mail
                size={50}
                strokeWidth={1.8}
                className="text-primary"
              />
            </div>

            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Stay in the{" "}
                <span className="text-primary">flow.</span>
              </h2>

              <p className="mt-2 text-sm leading-6 text-muted sm:text-base">
                Get the latest updates, tips, and features
                <br className="hidden sm:block" />
                delivered to your inbox.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="w-full max-w-xl">
            <form className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                placeholder="Enter your email"
                className="
                  h-12 min-w-0 flex-1
                  rounded-button
                  border border-border-subtle
                  bg-surface
                  px-4
                  text-sm text-foreground
                  outline-none
                  placeholder:text-muted-foreground
                  transition-all duration-200
                  focus:border-primary/50
                  focus:ring-2
                  focus:ring-primary/10
                "
              />

              <Button
                type="submit"
                className="h-12 whitespace-nowrap px-7"
              >
                Subscribe
              </Button>
            </form>

            <p className="mt-2 px-1 text-xs text-muted-foreground">
              No spam. Unsubscribe anytime.
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
};

export default SubscribeMail;