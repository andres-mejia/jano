import type { CorreoSaliente, MailSender } from "../../ports/correo";

/**
 * Correo en memoria: guarda lo que se enviaría. Idempotente como el real: la
 * misma clave devuelve el mismo `Message-ID` sin duplicar. `fallar` simula un
 * error del proveedor.
 */
export class DeterministicMailSender implements MailSender {
  readonly enviados: CorreoSaliente[] = [];
  private readonly porClave = new Map<string, string>();
  fallar: Error | null = null;

  async enviar(correo: CorreoSaliente) {
    if (this.fallar) throw this.fallar;
    const previo = this.porClave.get(correo.idempotencia);
    if (previo) return { messageId: previo };
    const messageId = `<${correo.idempotencia}@jano.test>`;
    this.porClave.set(correo.idempotencia, messageId);
    this.enviados.push(correo);
    return { messageId };
  }
}
