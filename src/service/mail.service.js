import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ejs from 'ejs';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

function normalizeEnv(value) {
  if (!value || value === 'null') {
    return null;
  }

  return value;
}

function expandEnvTemplate(value) {
  if (!value) {
    return value;
  }

  return value.replace(/\$\{APP_NAME\}/g, process.env.APP_NAME ?? 'UD DJAYA');
}

function createTransporter() {
  const mailer = normalizeEnv(process.env.MAIL_MAILER) ?? 'smtp';

  if (mailer !== 'smtp') {
    throw new Error(`MAIL_MAILER ${mailer} belum didukung.`);
  }

  const host = normalizeEnv(process.env.MAIL_HOST);
  const port = Number(process.env.MAIL_PORT ?? 587);
  const username = normalizeEnv(process.env.MAIL_USERNAME);
  const password = normalizeEnv(process.env.MAIL_PASSWORD);
  const encryption = normalizeEnv(process.env.MAIL_ENCRYPTION)?.toLowerCase();
  const secure = encryption === 'ssl' || encryption === 'tls' || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth:
      username && password
        ? {
            user: username,
            pass: password,
          }
        : undefined,
  });
}

function getFromAddress() {
  const fromAddress =
    normalizeEnv(process.env.MAIL_FROM_ADDRESS) ?? 'hello@example.com';
  const fromName = expandEnvTemplate(
    normalizeEnv(process.env.MAIL_FROM_NAME) ?? process.env.APP_NAME,
  );

  return fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;
}

export async function renderEmailTemplate(templateName, data) {
  const templatePath = path.join(projectRoot, 'views', 'email', templateName);

  return ejs.renderFile(templatePath, data, {
    async: true,
  });
}

export async function sendMail({ to, subject, template, data, attachments }) {
  const html = await renderEmailTemplate(template, data);
  const transporter = createTransporter();

  return transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    html,
    attachments,
  });
}

export function publicAssetPath(...segments) {
  return path.join(projectRoot, 'public', ...segments);
}
