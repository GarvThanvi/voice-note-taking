import axios from "axios";
import { getApiErrorMessage } from "../lib/apiError";

const api = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_URL || "http://localhost:8080/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Surface the server's message instead of "Request failed with status code 409".
// The original error is kept so callers can still inspect the response.
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error && typeof error === "object") {
      const message = getApiErrorMessage(error, "");
      if (message) {
        (error as { message: string }).message = message;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
