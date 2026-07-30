import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
const FROM = process.env.EMAIL_FROM ?? "Huye Finds <onboarding@resend.dev>";

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
): Promise<void> {
  if (!resend) {
    console.log(`[dev] Password reset link for ${to}: ${resetLink}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: "Reset your Huye Finds password",
      html: `<p>Someone requested a password reset for this account.</p>
             <p><a href="${resetLink}">Reset your password</a> — this link expires in 30 minutes.</p>
             <p>If you didn't request this, you can safely ignore this email.</p>`,
    });
  } catch (err) {
    console.error("Failed to send password reset email:", err);
  }
}
