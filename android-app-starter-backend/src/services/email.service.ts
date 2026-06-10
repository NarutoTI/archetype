import nodemailer from 'nodemailer';
import type { SendMailOptions, Transporter } from 'nodemailer';
import emailTemplates, { fallbackEmailTemplates } from './emailTemplates.js';
import logger from '../config/logger.js';

const getFrontendUrl = () => {
  if (process.env.FRONTEND_URL) {
    return process.env.FRONTEND_URL;
  }

  return process.env.NODE_ENV === 'development'
    ? 'http://10.0.2.2:8100'
    : 'http://localhost:8100';
};

class EmailService {
  private transporter: Transporter | null;
  private isConfigured: boolean;
  private initialized: boolean;

  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initialized = false;
  }

  ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
      this.initialized = true;
    }
  }

  initialize(): void {
    try {
      if (!process.env.SMTP_USER && process.env.NODE_ENV === 'development') {
        this.transporter = null;
        this.isConfigured = false;
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      this.isConfigured = true;
    } catch (error) {
      logger.error({ err: error }, 'Email service initialization failed');
      this.transporter = null;
      this.isConfigured = false;
    }
  }

  async sendConfirmationEmail(email: string, name: string, confirmationToken: string, language = 'en') {
    const confirmationUrl = `${getFrontendUrl()}/auth/callback?token=${confirmationToken}&success=true`;
    const template = (emailTemplates[language] || fallbackEmailTemplates).confirmation;

    return this.sendEmail({
      from: process.env.EMAIL_FROM || 'noreply@example.com',
      to: email,
      subject: template.subject,
      html: template.html(name, confirmationUrl)
    });
  }

  async sendPasswordResetEmail(email: string, name: string, resetToken: string, language = 'en') {
    const resetUrl = `${getFrontendUrl()}/auth/callback?token=${resetToken}&success=true`;
    const template = (emailTemplates[language] || fallbackEmailTemplates).passwordReset;

    return this.sendEmail({
      from: process.env.EMAIL_FROM || 'noreply@example.com',
      to: email,
      subject: template.subject,
      html: template.html(name, resetUrl)
    });
  }

  async sendAccountDeletionEmail(email: string, name: string, deletionToken: string, language = 'en') {
    const deletionUrl = `${getFrontendUrl()}/auth/callback?token=${deletionToken}&success=true`;
    const template = (emailTemplates[language] || fallbackEmailTemplates).accountDeletion;

    return this.sendEmail({
      from: process.env.EMAIL_FROM || 'noreply@example.com',
      to: email,
      subject: template.subject,
      html: template.html(name, deletionUrl)
    });
  }

  async sendEmail(mailOptions: SendMailOptions) {
    this.ensureInitialized();

    if (!this.isConfigured && process.env.NODE_ENV === 'development') {
      const html = typeof mailOptions.html === 'string' ? mailOptions.html : '';
      logger.info({
        to: mailOptions.to,
        subject: mailOptions.subject,
        links: this.extractLinksFromHtml(html)
      }, 'Development email skipped');
      return { messageId: 'dev-mode-fake-id' };
    }

    if (!this.transporter) {
      throw new Error('Email service not configured');
    }

    const result = await this.transporter.sendMail(mailOptions);
    logger.info('Email sent successfully to: %s', mailOptions.to);
    return result;
  }

  extractLinksFromHtml(html: string): string[] {
    const linkRegex = /href="([^"]+)"/g;
    const links = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      links.push(match[1]);
    }
    return links;
  }

  isReady(): boolean {
    this.ensureInitialized();
    return this.isConfigured || process.env.NODE_ENV === 'development';
  }
}

export const emailService = new EmailService();
