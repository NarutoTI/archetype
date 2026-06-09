import nodemailer from 'nodemailer';
import emailTemplates from './emailTemplates.js';
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
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initialized = false;
  }

  ensureInitialized() {
    if (!this.initialized) {
      this.initialize();
      this.initialized = true;
    }
  }

  initialize() {
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

  async sendConfirmationEmail(email, name, confirmationToken, language = 'en') {
    const confirmationUrl = `${getFrontendUrl()}/auth/callback?token=${confirmationToken}&success=true`;
    const template = emailTemplates[language]?.confirmation || emailTemplates.en.confirmation;

    return this.sendEmail({
      from: process.env.EMAIL_FROM || 'noreply@example.com',
      to: email,
      subject: template.subject,
      html: template.html(name, confirmationUrl)
    });
  }

  async sendPasswordResetEmail(email, name, resetToken, language = 'en') {
    const resetUrl = `${getFrontendUrl()}/auth/callback?token=${resetToken}&success=true`;
    const template = emailTemplates[language]?.passwordReset || emailTemplates.en.passwordReset;

    return this.sendEmail({
      from: process.env.EMAIL_FROM || 'noreply@example.com',
      to: email,
      subject: template.subject,
      html: template.html(name, resetUrl)
    });
  }

  async sendAccountDeletionEmail(email, name, deletionToken, language = 'en') {
    const deletionUrl = `${getFrontendUrl()}/auth/callback?token=${deletionToken}&success=true`;
    const template = emailTemplates[language]?.accountDeletion || emailTemplates.en.accountDeletion;

    return this.sendEmail({
      from: process.env.EMAIL_FROM || 'noreply@example.com',
      to: email,
      subject: template.subject,
      html: template.html(name, deletionUrl)
    });
  }

  async sendEmail(mailOptions) {
    this.ensureInitialized();

    if (!this.isConfigured && process.env.NODE_ENV === 'development') {
      logger.info({
        to: mailOptions.to,
        subject: mailOptions.subject,
        links: this.extractLinksFromHtml(mailOptions.html)
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

  extractLinksFromHtml(html) {
    const linkRegex = /href="([^"]+)"/g;
    const links = [];
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      links.push(match[1]);
    }
    return links;
  }

  isReady() {
    this.ensureInitialized();
    return this.isConfigured || process.env.NODE_ENV === 'development';
  }
}

export const emailService = new EmailService();
