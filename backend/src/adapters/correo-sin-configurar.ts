import type { MailSender } from "../ports/correo";

/**
 * Correo saliente en un entorno sin proveedor (dev hasta SES, spec 008 fase C).
 * No finge envíos: cada intento falla y el motor deja el paso `blocked` con este
 * motivo, visible en el registro.
 */
export class CorreoSinConfigurar implements MailSender {
  async enviar(): Promise<never> {
    throw new Error("El correo saliente aún no está configurado en este entorno (llega con SES).");
  }
}
