import api from "./axiosInstance";

export const subscribeToNewsletter = async (email: string) => {
  const response = await api.post("/newsletter/subscribe", { email });
  return response.data;
};
