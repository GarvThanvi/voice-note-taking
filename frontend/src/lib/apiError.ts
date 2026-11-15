interface ApiErrorLike {
  message?: unknown;
  response?: {
    data?: {
      message?: unknown;
    };
  };
}

export const getApiErrorMessage = (
  error: unknown,
  fallback = "Something went wrong"
): string => {
  if (typeof error === "object" && error !== null) {
    const apiError = error as ApiErrorLike;
    const serverMessage = apiError.response?.data?.message;
    if (typeof serverMessage === "string" && serverMessage.trim()) {
      return serverMessage.trim();
    }

    if (typeof apiError.message === "string" && apiError.message.trim()) {
      return apiError.message.trim();
    }
  }

  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return fallback;
};
