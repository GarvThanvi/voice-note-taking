export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export const passwordResetOtpEmail = (otp: string): EmailContent => {
  const subject = "Your NoteFlow password reset code";

  const text = [
    `Your NoteFlow password reset code is ${otp}.`,
    "",
    "This code expires in 10 minutes.",
    "If you didn't request a password reset, you can safely ignore this email — your password won't change.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#050607;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your password reset code is inside. It expires in 10 minutes.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#050607;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background-color:#0d0f10;border:1px solid #24272a;border-radius:16px;">
            <tr>
              <td style="padding:40px 40px 32px 40px;font-family:Inter,Arial,Helvetica,sans-serif;">
                <div style="font-size:20px;font-weight:700;letter-spacing:-0.5px;color:#ff4058;">NoteFlow</div>
                <h1 style="margin:28px 0 0 0;font-size:22px;line-height:1.3;font-weight:600;color:#f5f5f5;">Reset your password</h1>
                <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#a1a1a1;">
                  Use the code below to set a new password. This code expires in <strong style="color:#f5f5f5;">10 minutes</strong>.
                </p>
                <div style="margin:28px 0;padding:20px 0;text-align:center;background-color:#121416;border:1px solid #24272a;border-radius:12px;">
                  <span style="font-family:'Courier New',Courier,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#f5f5f5;padding-left:10px;">${otp}</span>
                </div>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#66686b;">
                  If you didn't request a password reset, you can safely ignore this email — your password won't change.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;font-family:Inter,Arial,Helvetica,sans-serif;">
                <div style="border-top:1px solid #191b1d;padding-top:20px;font-size:12px;line-height:1.6;color:#66686b;">
                  Sent by NoteFlow. Please don't reply to this email.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
};
