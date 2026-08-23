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
