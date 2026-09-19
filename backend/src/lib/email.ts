import "dotenv/config";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | null = null;

const getTransporter = (): Transporter => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

export const sendEmail = async ({
  to,
  subject,
  html,
  text,
}: SendEmailInput): Promise<void> => {
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
    text,
  });
};
