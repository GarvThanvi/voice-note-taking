import api from "./axiosInstance";

interface LoginData {
  email: string;
  password: string;
}

export const loginUser = async (data: LoginData) => {
  const response = await api.post("/auth/signin", data);
  return response.data;
};
