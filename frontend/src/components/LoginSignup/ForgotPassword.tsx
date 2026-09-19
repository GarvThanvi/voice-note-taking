import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import { ArrowLeft, CheckCircle2, Loader2, Lock, Mail } from "lucide-react";
import Button from "../ui/Button";
import AuthInput from "./AuthInput";
import OtpInput from "./OtpInput";
import {
  forgotPassword,
  verifyResetOtp,
  resetPassword,
} from "../../api/authApi";

interface ForgotPasswordProps {
  onBackToLogin: () => void;
}

type Step = "email" | "otp" | "password" | "done";

const RESEND_COOLDOWN_SECONDS = 60;

const ForgotPassword = ({ onBackToLogin }: ForgotPasswordProps) => {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const getError = (error: unknown, fallback: string) => {
    if (axios.isAxiosError(error)) {
      return (error.response?.data?.message as string) || fallback;
    }
    return "Something went wrong. Please try again.";
  };

  const handleSendCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage("Please enter your email");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const data = await forgotPassword(email.trim());
      if (data.success) {
        setOtp("");
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setStep("otp");
      } else {
        setErrorMessage(data.message || "Unable to send reset code.");
      }
    } catch (error) {
      setErrorMessage(getError(error, "Unable to send reset code."));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;

    setLoading(true);
    setErrorMessage("");
    try {
      const data = await forgotPassword(email.trim());
      if (data.success) {
        setOtp("");
        setCooldown(RESEND_COOLDOWN_SECONDS);
      } else {
        setErrorMessage(data.message || "Unable to resend code.");
      }
    } catch (error) {
      setErrorMessage(getError(error, "Unable to resend code."));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setErrorMessage("Please enter the 6-digit code");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const data = await verifyResetOtp(email.trim(), otp);
      if (data.success) {
        setStep("password");
      } else {
        setErrorMessage(data.message || "Invalid or expired code.");
      }
    } catch (error) {
      setErrorMessage(getError(error, "Invalid or expired code."));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    try {
      const data = await resetPassword(email.trim(), otp, password);
      if (data.success) {
        setStep("done");
      } else {
        setErrorMessage(data.message || "Unable to reset password.");
      }
    } catch (error) {
      setErrorMessage(getError(error, "Unable to reset password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div key={step} className="animate-auth-enter">
      <div className="mb-7 text-center">
        <h1 className="text-2xl font-normal tracking-tight text-foreground">
          {step === "email" && "Forgot your password?"}
          {step === "otp" && "Enter the code"}
          {step === "password" && "Set a new password"}
          {step === "done" && "Password updated"}
        </h1>

        <p className="mt-2 text-sm text-muted">
          {step === "email" && "We'll email you a 6-digit code to reset it."}
          {step === "otp" && (
            <>
              Enter the 6-digit code sent to{" "}
              <span className="text-foreground">{email}</span>.
            </>
          )}
          {step === "password" && "Choose a new password for your account."}
          {step === "done" && "You can now log in with your new password."}
        </p>
      </div>

      {step === "email" && (
        <form onSubmit={handleSendCode} className="flex flex-col gap-5">
          <AuthInput
            id="email"
            label="Email"
            type="email"
            placeholder="Enter your email"
            icon={<Mail size={18} />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {errorMessage && <p className="text-sm text-muted">{errorMessage}</p>}

          <Button type="submit" className="h-12 w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : "Send code"}
          </Button>

          <button
            type="button"
            onClick={onBackToLogin}
            className="mx-auto flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft size={15} />
            Back to log in
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
          <OtpInput value={otp} onChange={setOtp} disabled={loading} autoFocus />

          {errorMessage && (
            <p className="text-center text-sm text-muted">{errorMessage}</p>
          )}

          <Button
            type="submit"
            className="h-12 w-full"
            disabled={loading || otp.length !== 6}
          >
            {loading ? <Loader2 className="animate-spin" /> : "Verify code"}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => {
                setErrorMessage("");
                setOtp("");
                setStep("email");
              }}
              className="flex items-center gap-1.5 text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft size={15} />
              Change email
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || loading}
              className="
                font-medium
                text-primary
                transition-colors
                hover:text-primary-hover
                disabled:text-muted
                disabled:hover:text-muted
              "
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handleResetPassword} className="flex flex-col gap-5">
          <AuthInput
            id="password"
            label="New password"
            type="password"
            placeholder="Create a new password"
            icon={<Lock size={18} />}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((prev) => !prev)}
          />

          <AuthInput
            id="confirmPassword"
            label="Confirm password"
            type="password"
            placeholder="Confirm your new password"
            icon={<Lock size={18} />}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            showPassword={showConfirmPassword}
            onTogglePassword={() => setShowConfirmPassword((prev) => !prev)}
          />

          {errorMessage && <p className="text-sm text-muted">{errorMessage}</p>}

          <Button type="submit" className="h-12 w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : "Reset password"}
          </Button>

          <button
            type="button"
            onClick={() => {
              setErrorMessage("");
              setStep("otp");
            }}
            className="mx-auto flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft size={15} />
            Back
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <CheckCircle2 size={40} className="text-primary" />
            <p className="text-sm text-muted">
              Your password has been reset successfully.
            </p>
          </div>

          <Button
            type="button"
            className="h-12 w-full"
            onClick={onBackToLogin}
          >
            Back to log in
          </Button>
        </div>
      )}
    </div>
  );
};

export default ForgotPassword;
