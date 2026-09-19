import api from "./axiosInstance";

interface LoginData {
  email: string;
  password: string;
}

interface SignupData {
  username: string;
  email: string;
  password: string;
}

export const loginUser = async (data: LoginData) => {
  const response = await api.post("/auth/signin", data);
  return response.data;
};

export const signupUser = async (data: SignupData) => {
  const response = await api.post("/auth/signup", data);
  return response.data;
};

export const getCurrentUser = async (token: string) => {
  const response = await api.get("/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const googleRedirect = async () => {
  const response = await api.get("/auth/google");
  return response.data;
};

export const updateGuidePreferences = async (data: {
  hasSeenGuide?: boolean;
  showGuideOnLogin?: boolean;
}) => {
  const response = await api.put("/auth/guide", data);
  return response.data;
};

export const forgotPassword = async (email: string) => {
  const response = await api.post("/auth/forgot-password", { email });
  return response.data;
};

export const verifyResetOtp = async (email: string, otp: string) => {
  const response = await api.post("/auth/verify-reset-otp", { email, otp });
  return response.data;
};

export const resetPassword = async (
  email: string,
  otp: string,
  password: string
) => {
  const response = await api.post("/auth/reset-password", {
    email,
    otp,
    password,
  });
  return response.data;
};
