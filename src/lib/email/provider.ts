import nodemailer from "nodemailer";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { maskEmail } from "../crypto";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

/**
 * "accepted" means the provider accepted the message for delivery. It does
 * NOT mean the message was delivered to the inbox.
 */
export type SendResult = { accepted: boolean; providerMessageId?: string; error?: string };

export interface EmailProvider {
  readonly name: string;
  readonly sendsRealEmail: boolean;
  send(msg: OutgoingEmail): Promise<SendResult>;
}

/** Development provider: stores messages in the admin "Dev mailbox". Sends nothing. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  readonly sendsRealEmail = false;
  async send(msg: OutgoingEmail): Promise<SendResult> {
    const row = await prisma.devOutboxMessage.create({
      data: {
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        headers: (msg.headers ?? {}) as Prisma.InputJsonValue,
      },
    });
    console.info(`[email:console] stored "${msg.subject}" for ${maskEmail(msg.to)} (not sent)`);
    return { accepted: true, providerMessageId: `dev-${row.id}` };
  }
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  readonly sendsRealEmail = true;
  private transport = nodemailer.createTransport({
    host: env.read("SMTP_HOST") ?? "localhost",
    port: Number(env.read("SMTP_PORT") ?? 1025),
    secure: Number(env.read("SMTP_PORT") ?? 1025) === 465,
    auth: env.read("SMTP_USER") ? { user: env.read("SMTP_USER")!, pass: env.read("SMTP_PASSWORD") ?? "" } : undefined,
  });
  async send(msg: OutgoingEmail): Promise<SendResult> {
    try {
      const info = await this.transport.sendMail({
        from: env.emailFrom,
        replyTo: env.emailReplyTo,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        headers: msg.headers,
      });
      return { accepted: info.accepted.length > 0, providerMessageId: info.messageId, error: info.rejected.length ? "Rejected by SMTP server" : undefined };
    } catch (e) {
      return { accepted: false, error: (e as Error).message.slice(0, 300) };
    }
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  readonly sendsRealEmail = true;
  constructor(private apiKey = env.read("RESEND_API_KEY")) {}
  async send(msg: OutgoingEmail): Promise<SendResult> {
    if (!this.apiKey) return { accepted: false, error: "RESEND_API_KEY is not configured" };
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: env.emailFrom,
          reply_to: env.emailReplyTo,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          headers: msg.headers,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) return { accepted: false, error: `Resend ${res.status}: ${body.message ?? "error"}`.slice(0, 300) };
      return { accepted: true, providerMessageId: body.id };
    } catch (e) {
      return { accepted: false, error: (e as Error).message.slice(0, 300) };
    }
  }
}

let override: EmailProvider | null = null;
/** Tests can inject a fake provider. */
export function setEmailProviderForTests(p: EmailProvider | null) {
  override = p;
}

export function getEmailProvider(): EmailProvider {
  if (override) return override;
  switch (env.emailProvider) {
    case "smtp":
      return new SmtpEmailProvider();
    case "resend":
      return new ResendEmailProvider();
    default:
      return new ConsoleEmailProvider();
  }
}
