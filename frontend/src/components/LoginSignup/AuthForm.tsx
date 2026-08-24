import { Loader2, Lock, Mail, User } from "lucide-react";
import { useState } from "react";

import Button from "../ui/Button";
import AuthInput from "./AuthInput";
import AuthDivider from "./AuthDivider";
import GoogleButton from "./GoogleButton";
import { googleRedirect, loginUser, signupUser } from "../../api/authApi";
import { useAuth } from "../../context/AuthContext";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";

export type AuthMode = "login" | "signup";

interface AuthFormProps {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
}

const AuthForm = ({ mode, onModeChange }: AuthFormProps) => {
  const isLogin = mode === "login";
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    setLoading(true);
    setErrorMessage("");
    e.preventDefault();

    if (!isLogin) {
      if (formData.password !== formData.confirmPassword) {
        setErrorMessage("Passwords do not match");
        setLoading(false);
        return;
      }

      try {
        let email: string = formData.email;
        let password: string = formData.password;
        let username: string = formData.name;
        if (!email || !password || !username) {
          setErrorMessage("Form fields cannot be empty");
          return;
        }

        const data = await signupUser({ email, password, username });
        if (data.success) {
          setUser(data.user);
          localStorage.setItem("token", data.token);
          navigate("/note");
        } else {
          setErrorMessage(data.message || "Failed to login. Try again");
        }
      } catch (error) {
        console.error("Error while signing in ", error);
        if (axios.isAxiosError(error)) {
          setErrorMessage(
            error.response?.data?.message || "Failed to login. Try again",
          );
        } else {
          setErrorMessage("Something went wrong. Please try again.");
        }
      } finally {
        setLoading(false);
      }

      return;
    }

    try {
      let email: string = formData.email;
      let password: string = formData.password;

      if (!email || !password) {
        setErrorMessage("Form fields cannot be empty");
        return;
      }

      const data = await loginUser({ email, password });
      if (data.success) {
        setUser(data.user);
        localStorage.setItem("token", data.token);
        navigate(location.state?.from?.pathname || "/note", { replace: true });
      } else {
        setErrorMessage(data.message || "Failed to login. Try again");
      }
    } catch (error) {
      console.error("Error while signing in ", error);
      if (axios.isAxiosError(error)) {
        setErrorMessage(
          error.response?.data?.message || "Failed to login. Try again",
        );
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    window.location.href = `${import.meta.env.VITE_APP_BASE_URL}/auth/google`
  };

  const switchMode = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    onModeChange(isLogin ? "signup" : "login");
  };

  return (
    <div key={mode} className="animate-auth-enter">
      {/* Header */}
      <div className="mb-7 text-center">
        <h1 className="text-2xl font-normal tracking-tight text-foreground">
          {isLogin ? "Welcome back" : "Create your account"}
        </h1>

        <p className="mt-2 text-sm text-muted">
          {isLogin
            ? "Log in to continue to your notes."
            : "Start your note taking journey."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Name */}
        {!isLogin && (
          <AuthInput
            id="name"
            label="Full name"
            placeholder="Enter your full name"
            icon={<User size={18} />}
            value={formData.name}
            onChange={handleChange}
          />
        )}

        {/* Email */}
        <AuthInput
          id="email"
          label="Email"
          type="email"
          placeholder="Enter your email"
          icon={<Mail size={18} />}
          value={formData.email}
          onChange={handleChange}
        />

        {/* Password */}
        <AuthInput
          id="password"
          label="Password"
          type="password"
          placeholder={isLogin ? "Enter your password" : "Create a password"}
          icon={<Lock size={18} />}
          value={formData.password}
          onChange={handleChange}
          showPassword={showPassword}
          onTogglePassword={() => setShowPassword((prev) => !prev)}
        />

        {/* Confirm password */}
        {!isLogin && (
          <AuthInput
            id="confirmPassword"
            label="Confirm password"
            type="password"
            placeholder="Confirm your password"
            icon={<Lock size={18} />}
            value={formData.confirmPassword}
            onChange={handleChange}
            showPassword={showConfirmPassword}
            onTogglePassword={() => setShowConfirmPassword((prev) => !prev)}
          />
        )}

        {/* Forgot password */}
        {isLogin && (
          <div className="-mt-2 flex justify-end">
            <button
              type="button"
              className="
                text-xs
                text-primary
                transition-colors
                hover:text-primary-hover
              "
            >
              Forgot password?
            </button>
          </div>
        )}

        {errorMessage && <p className="text-sm text-muted">{errorMessage}</p>}

        {/* Submit */}
        <Button type="submit" className="h-12 w-full">
          {!loading ? (
            isLogin ? (
              "Log in"
            ) : (
              "Sign up"
            )
          ) : (
            <Loader2 className="animate-spin" />
          )}
        </Button>

        {/* Divider */}
        <AuthDivider />

        {/* Google */}
        <GoogleButton onClick={handleGoogleSignIn} />

        {/* Switch */}
        <p className="text-center text-sm text-muted">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            className="
              font-medium
              text-primary
              transition-colors
              hover:text-primary-hover
            "
          >
            {isLogin ? "Sign up" : "Log in"}
          </button>
        </p>
      </form>
    </div>
  );
};

export default AuthForm;
