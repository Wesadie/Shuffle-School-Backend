import { createHmac, timingSafeEqual } from "crypto";

export interface TeacherSurveyTokenPayload {
  accountId: string;
  teacherId: string;
  className: string;
  surveyDate: string;
  expiresAt: number;
}

function getSigningSecret() {
  const secret = process.env.SURVEY_LINK_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SURVEY_LINK_SECRET or SESSION_SECRET is required for teacher survey links");
  }
  return secret;
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSigningSecret()).update(encodedPayload).digest("base64url");
}

export function createTeacherSurveyToken(payload: TeacherSurveyTokenPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyTeacherSurveyToken(token: string): TeacherSurveyTokenPayload | null {
  const [encodedPayload, suppliedSignature] = token.split(".");
  if (!encodedPayload || !suppliedSignature) return null;

  const expectedSignature = sign(encodedPayload);
  const expectedBuffer = Buffer.from(expectedSignature);
  const suppliedBuffer = Buffer.from(suppliedSignature);
  if (expectedBuffer.length !== suppliedBuffer.length || !timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TeacherSurveyTokenPayload;
    if (
      !payload.accountId ||
      !payload.teacherId ||
      !payload.className ||
      !payload.surveyDate ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function sendTeacherSurveyEmail(input: {
  to: string;
  replyTo?: string;
  teacherName: string;
  message: string;
  surveyUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

  const messageHtml = escapeHtml(input.message).replace(/\n/g, "<br />");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "ShuffleSchool <notifications@shuffleschool.co.za>",
      to: [input.to],
      reply_to: input.replyTo,
      subject: "ShuffleSchool teacher survey",
      html: `
        <div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:640px;margin:0 auto">
          <p style="font-weight:700">[DO NOT FORWARD THIS EMAIL]</p>
          <p>Hello ${escapeHtml(input.teacherName)},</p>
          <p>${messageHtml}</p>
          <p style="margin:28px 0">
            <a href="${escapeHtml(input.surveyUrl)}" style="display:inline-block;background:#0891b2;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:700">Access Survey</a>
          </p>
          <p><strong>Important Information:</strong></p>
          <ul>
            <li>Your changes are saved automatically.</li>
            <li>Click <strong>Mark Survey Complete</strong> when you have finished.</li>
            <li>Keep this confidential link private. No account is required.</li>
          </ul>
          <p>If you need help, reply to this email to contact your school administrator.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend rejected the email (${response.status}): ${body}`);
  }
  return response.json() as Promise<{ id: string }>;
}
