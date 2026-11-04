import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sendSmtpMail, SmtpOptions } from './smtp.transport';

/**
 * Transactional-mail transport for auth flows.
 *
 * Precedence:
 * 1. SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS) — real delivery, e.g. Yandex Mail
 *    on smtp.yandex.ru:465 with an application password.
 * 2. MAILER_WEBHOOK_URL — an HTTP bridge that accepts
 *    `{ from, to, subject, text, html }`.
 * 3. Log the reset link to the backend console (dev fallback).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;
  private readonly webhookUrl: string | undefined;
  private readonly smtp: SmtpOptions | undefined;
  private readonly appName: string;

  constructor(config: ConfigService) {
    this.appName = config.get<string>('APP_NAME') ?? 'App Template';
    this.webhookUrl = config.get<string>('MAILER_WEBHOOK_URL');

    const smtpHost = config.get<string>('SMTP_HOST');
    const smtpUser = config.get<string>('SMTP_USER');
    const smtpPass = config.get<string>('SMTP_PASS');

    if (smtpHost && smtpUser && smtpPass) {
      this.smtp = {
        host: smtpHost,
        port: Number(config.get<string>('SMTP_PORT') ?? 465),
        user: smtpUser,
        pass: smtpPass,
      };
    }

    // Yandex (and most providers) require the From address to match the
    // authenticated mailbox, so default to SMTP_USER when it is available.
    this.from =
      config.get<string>('MAILER_FROM') ??
      (smtpUser
        ? `${this.appName} <${smtpUser}>`
        : `${this.appName} <no-reply@localhost>`);
  }

  async sendPasswordResetEmail(to: string, link: string): Promise<void> {
    await this.send({
      to,
      subject: `Сброс пароля ${this.appName}`,
      text:
        `Перейдите по ссылке, чтобы задать новый пароль:\n${link}\n\n` +
        'Ссылка действительна 30 минут. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.',
      html:
        `<p>Перейдите по ссылке, чтобы задать новый пароль:</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        '<p>Ссылка действительна 30 минут. Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>',
    });
  }

  async sendEmailVerificationEmail(to: string, link: string): Promise<void> {
    await this.send({
      to,
      subject: `Подтверждение email — ${this.appName}`,
      text:
        `Подтвердите ваш email, перейдя по ссылке:\n${link}\n\n` +
        `Если вы не регистрировались в ${this.appName}, проигнорируйте это письмо.`,
      html:
        `<p>Подтвердите ваш email, перейдя по ссылке:</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p>Если вы не регистрировались в ${this.appName}, проигнорируйте это письмо.</p>`,
    });
  }

  private async send(message: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    const { to, subject, text, html } = message;

    if (this.smtp) {
      await sendSmtpMail(this.smtp, {
        from: this.from,
        to,
        subject,
        text,
        html,
      });
      return;
    }

    if (this.webhookUrl) {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to, subject, text, html }),
      });
      if (!res.ok) {
        throw new Error(`Mailer webhook failed with status ${res.status}`);
      }
      return;
    }

    // Dev fallback: no transport configured. Keep the link observable so the
    // flow can be tested end-to-end until SMTP/MAILER_WEBHOOK_URL is set.
    this.logger.warn(
      `No mail transport configured (set SMTP_HOST/SMTP_USER/SMTP_PASS or ` +
        `MAILER_WEBHOOK_URL) — email not actually sent. ` +
        `LINK for ${to}: ${text.split('\n').find((line) => line.startsWith('http')) ?? ''}`,
    );
  }
}
