import nodemailer from 'nodemailer';

/**
 * Sends an email if SMTP is configured. Returns { sent, skipped }.
 * Alert functionality still works without SMTP (the target is marked
 * triggered); only the email delivery is skipped.
 */
export async function sendMail({ to, subject, html, text }) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        console.log(`[mailer] SMTP not configured — skipping email to ${to} ("${subject}")`);
        return { sent: false, skipped: true };
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT || 587) === 465,
        auth: process.env.SMTP_PASS ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]+>/g, ' '),
        });
        return { sent: true };
    } catch (err) {
        console.error('[mailer] Failed to send email:', err.message);
        return { sent: false, error: err.message };
    }
}

export function targetAlertTemplate({ user, target, price }) {
    const dir = target.target_type === 'price_fall' ? 'fell below' : target.target_type === 'price_rise' ? 'rose above' : 'moved';
    return `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <div style="background:#0f172a;color:#fff;padding:16px 24px">
          <h2 style="margin:0;font-size:18px">🎯 Price Target Alert</h2>
        </div>
        <div style="padding:24px;color:#111827">
          <p style="margin:0 0 12px">Hi ${user.full_name},</p>
          <p style="margin:0 0 12px">
            Your target for <strong>${target.stock_symbol}</strong> (${target.stock_name}) has been triggered.
          </p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:6px 0;color:#6b7280">Target type</td><td style="text-align:right">${dir} ₹${Number(target.condition_value).toFixed(2)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Price at creation</td><td style="text-align:right">₹${Number(target.price_at_creation).toFixed(2)}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Current price</td><td style="text-align:right;font-weight:700">₹${Number(price).toFixed(2)}</td></tr>
          </table>
          <p style="color:#6b7280;font-size:12px">This alert was triggered at ${new Date().toUTCString()} (UTC). This is informational only — no trading advice.</p>
          <p style="margin-top:24px">— Stock Market Analysis Platform</p>
        </div>
      </div>`;
}
