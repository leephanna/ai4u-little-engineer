/**
 * Resend email utility for AI4U Little Engineer.
 *
 * Phase 3B: Email notifications via Resend
 *
 * Supported notification types:
 *   - job_completed   → "Your CAD model is ready"
 *   - job_failed      → "CAD generation failed"
 *   - welcome         → "Welcome to AI4U Little Engineer"
 */

import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM_ADDRESS =
  process.env.RESEND_FROM_EMAIL ?? "AI4U Little Engineer <noreply@ai4u.app>";

// ── Email templates ───────────────────────────────────────────────────────────

function jobCompletedHtml(opts: {
  jobTitle: string;
  jobUrl: string;
  partFamily: string;
  printTimeMinutes?: number;
}): string {
  const printTime = opts.printTimeMinutes
    ? `<p style="color:#94a3b8;font-size:14px;">⏱ Estimated print time: <strong>${opts.printTimeMinutes} min</strong></p>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:32px;">
  <div style="max-width:480px;margin:0 auto;">
    <h1 style="color:#f1f5f9;font-size:24px;margin-bottom:8px;">⚙️ Your CAD model is ready!</h1>
    <p style="color:#94a3b8;font-size:16px;margin-bottom:24px;">
      <strong style="color:#e2e8f0;">${opts.jobTitle}</strong> has been generated successfully.
    </p>
    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="color:#94a3b8;font-size:14px;margin:0 0 8px;">Part family: <strong style="color:#e2e8f0;">${opts.partFamily}</strong></p>
      ${printTime}
    </div>
    <a href="${opts.jobUrl}"
       style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;">
      View &amp; Download →
    </a>
    <p style="color:#475569;font-size:12px;margin-top:32px;">
      You're receiving this because you have email notifications enabled.<br/>
      AI4U Little Engineer — Voice-to-CAD for Machinists
    </p>
  </div>
</body>
</html>`;
}

function jobFailedHtml(opts: {
  jobTitle: string;
  jobUrl: string;
  errorText?: string;
}): string {
  const errorBlock = opts.errorText
    ? `<div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:8px;padding:12px;margin-bottom:20px;font-family:monospace;font-size:12px;color:#fca5a5;">${opts.errorText}</div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:32px;">
  <div style="max-width:480px;margin:0 auto;">
    <h1 style="color:#f87171;font-size:24px;margin-bottom:8px;">❌ CAD generation failed</h1>
    <p style="color:#94a3b8;font-size:16px;margin-bottom:24px;">
      <strong style="color:#e2e8f0;">${opts.jobTitle}</strong> could not be generated.
    </p>
    ${errorBlock}
    <a href="${opts.jobUrl}"
       style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;">
      View Job &amp; Retry →
    </a>
    <p style="color:#475569;font-size:12px;margin-top:32px;">
      AI4U Little Engineer — Voice-to-CAD for Machinists
    </p>
  </div>
</body>
</html>`;
}

function welcomeHtml(opts: { email: string }): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:sans-serif;padding:32px;">
  <div style="max-width:480px;margin:0 auto;">
    <h1 style="color:#f1f5f9;font-size:28px;margin-bottom:8px;">⚙️ Welcome to AI4U Little Engineer!</h1>
    <p style="color:#94a3b8;font-size:16px;margin-bottom:24px;">
      You're now set up to generate production-ready CAD parts using just your voice.
    </p>
    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="color:#94a3b8;font-size:14px;margin:0 0 12px;font-weight:600;color:#e2e8f0;">Get started in 3 steps:</p>
      <ol style="color:#94a3b8;font-size:14px;margin:0;padding-left:20px;line-height:1.8;">
        <li>Describe your part in plain English (or use voice input)</li>
        <li>Review the generated spec and click Generate</li>
        <li>Download your STEP or STL file and print!</li>
      </ol>
    </div>
    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://ai4u-little-engineer-web-lee-hannas-projects.vercel.app"}/jobs/new"
       style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600;font-size:15px;">
      Generate Your First Part →
    </a>
    <p style="color:#475569;font-size:12px;margin-top:32px;">
      You signed up with ${opts.email}.<br/>
      AI4U Little Engineer — Voice-to-CAD for Machinists
    </p>
  </div>
</body>
</html>`;
}

// ── Public send functions ─────────────────────────────────────────────────────

export async function sendJobCompletedEmail(opts: {
  to: string;
  jobTitle: string;
  jobId: string;
  partFamily: string;
  printTimeMinutes?: number;
}) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://ai4u-little-engineer-web-lee-hannas-projects.vercel.app";

  const resend = getResend();
  return resend.emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: `✅ CAD ready: ${opts.jobTitle}`,
    html: jobCompletedHtml({
      jobTitle: opts.jobTitle,
      jobUrl: `${appUrl}/jobs/${opts.jobId}`,
      partFamily: opts.partFamily,
      printTimeMinutes: opts.printTimeMinutes,
    }),
  });
}

export async function sendJobFailedEmail(opts: {
  to: string;
  jobTitle: string;
  jobId: string;
  errorText?: string;
}) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://ai4u-little-engineer-web-lee-hannas-projects.vercel.app";

  const resend = getResend();
  return resend.emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: `❌ Generation failed: ${opts.jobTitle}`,
    html: jobFailedHtml({
      jobTitle: opts.jobTitle,
      jobUrl: `${appUrl}/jobs/${opts.jobId}`,
      errorText: opts.errorText,
    }),
  });
}

export async function sendWelcomeEmail(opts: { to: string }) {
  const resend = getResend();
  return resend.emails.send({
    from: FROM_ADDRESS,
    to: opts.to,
    subject: "⚙️ Welcome to AI4U Little Engineer!",
    html: welcomeHtml({ email: opts.to }),
  });
}
