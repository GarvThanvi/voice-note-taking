import crypto from "node:crypto";
import bcrypt from "bcrypt";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export const generateOtp = (): string =>
  crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

export const hashOtp = (otp: string): Promise<string> => bcrypt.hash(otp, 10);

export const verifyOtp = (otp: string, hash: string): Promise<boolean> =>
  bcrypt.compare(otp, hash);
