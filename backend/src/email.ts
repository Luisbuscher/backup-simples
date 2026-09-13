import { Resend } from "resend";
import type { AppConfig } from "./config.js";

export interface EmailSender {
  sendConfirmation(to: string, name: string, confirmationUrl: string): Promise<void>;
}

export function createEmailSender(config: AppConfig): EmailSender {
  if (config.email.deliveryMode === "log") {
    return {
      async sendConfirmation(to, _name, confirmationUrl) {
        console.log(`[e-mail:log] Confirmação para ${to}: ${confirmationUrl}`);
      },
    };
  }

  const resend = new Resend(config.email.apiKey);
  return {
    async sendConfirmation(to, name, confirmationUrl) {
      const { error } = await resend.emails.send({
        from: config.email.from,
        to,
        subject: "Confirme sua conta no Backup Simples",
        html: `
          <div style="font-family:Arial,sans-serif;color:#172638;line-height:1.6">
            <h1 style="font-size:22px">Olá, ${escapeHtml(name)}!</h1>
            <p>Confirme seu e-mail para começar a usar o Backup Simples.</p>
            <p><a href="${escapeHtml(confirmationUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#00a884;color:white;text-decoration:none;font-weight:bold">Confirmar meu e-mail</a></p>
            <p style="font-size:13px;color:#687888">Este link expira em 24 horas.</p>
          </div>
        `,
      });
      if (error) throw new Error(`Falha ao enviar e-mail: ${error.message}`);
    },
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}
