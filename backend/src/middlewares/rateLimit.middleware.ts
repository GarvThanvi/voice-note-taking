import { rateLimit, ipKeyGenerator } from "express-rate-limit";

const TOO_MANY_REQUESTS = {
  success: false,
  message: "Too many requests. Please try again later.",
};

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});

export const signinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
});

export const voiceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: TOO_MANY_REQUESTS,
  keyGenerator: (req) =>
    req.userId !== undefined
      ? `user:${req.userId}`
      : ipKeyGenerator(req.ip ?? ""),
});
