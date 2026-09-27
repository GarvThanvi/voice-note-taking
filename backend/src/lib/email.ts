import "dotenv/config";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 10_000;

export const sendEmail = async ({
  to,
  subject,
  html,
  text,
}: SendEmailInput): Promise<void> => {
  const apiKey = process.env.BREVO_API_KEY;
  const name = process.env.EMAIL_FROM_NAME?.trim();
  const email = process.env.EMAIL_FROM_ADDRESS?.trim();

  if (!apiKey || !email) {
    throw new Error(
      "Missing BREVO_API_KEY or EMAIL_FROM_ADDRESS environment variable",
    );
  }

  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: name ? { name, email } : { email },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Brevo send failed (${response.status}): ${detail}`);
  }
};
