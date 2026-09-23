import { useState } from "react";
import axios from "axios";
import { Loader2, Mail } from "lucide-react";
import Button from "../ui/Button";
import Container from "../ui/Container";
import Reveal from "../ui/Reveal";
import { subscribeToNewsletter } from "../../api/newsletterApi";

type Status = { type: "success" | "error"; message: string };

const SubscribeMail = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email.trim()) {
      setStatus({ type: "error", message: "Please enter your email." });
      return;
    }

    try {
      setLoading(true);
      setStatus(null);

      const data = await subscribeToNewsletter(email);

      if (data.success) {
        setEmail("");
        setStatus({
          type: "success",
          message: data.message || "Thanks for subscribing!",
        });
      } else {
        setStatus({
          type: "error",
          message: data.message || "Something went wrong. Please try again.",
        });
      }
    } catch (error) {
      console.error("Error while subscribing to newsletter", error);
      if (axios.isAxiosError(error)) {
        setStatus({
          type: "error",
          message:
            error.response?.data?.message ||
            "Something went wrong. Please try again.",
        });
      } else {
        setStatus({
          type: "error",
          message: "Something went wrong. Please try again.",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="w-full py-16 sm:py-20">
      <Container>
        <Reveal>
          <div className="px-6 sm:px-10 lg:px-16 flex flex-col items-center gap-8 text-center lg:flex-row lg:items-center lg:justify-between lg:text-left">
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
              <form
                onSubmit={handleSubmit}
                noValidate
                className="flex flex-col gap-3 sm:flex-row"
              >
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="
                    h-12 w-full min-w-0
                    rounded-button
                    border border-border-subtle
                    bg-surface
                    px-4
                    text-left text-base text-foreground
                    outline-none
                    placeholder:text-muted-foreground
                    transition-all duration-200
                    focus:border-primary/50
                    focus:ring-2
                    focus:ring-primary/10
                    sm:flex-1
                    sm:text-sm
                  "
                />

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 whitespace-nowrap px-7"
                >
                  {loading ? <Loader2 className="animate-spin" /> : "Subscribe"}
                </Button>
              </form>

              {status ? (
                <p
                  className={`mt-2 px-1 text-xs ${
                    status.type === "success"
                      ? "text-foreground"
                      : "text-red-400"
                  }`}
                >
                  {status.message}
                </p>
              ) : (
                <p className="mt-2 px-1 text-xs text-muted-foreground">
                  No spam. Unsubscribe anytime.
                </p>
              )}
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
};

export default SubscribeMail;
