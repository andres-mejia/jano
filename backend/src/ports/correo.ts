import type { MeetingSlot } from "@jano/domain";

/**
 * Correo saliente (spec 008 FR-020). Solo el motor lo llama, y solo después de
 * comprobar las reglas: la lista blanca es una regla del motor, no del adaptador
 * (FR-021). El adaptador añade el Reply-To con el token y el pie de baja.
 */
export interface CorreoSaliente {
  readonly para: string;
  readonly asunto: string;
  readonly cuerpo: string;
  /** Token opaco del prospect: Reply-To y enlace de baja. */
  readonly token: string;
  /** El mismo valor no envía dos veces (id del paso o del elemento de la bandeja). */
  readonly idempotencia: string;
  /** `Message-ID` al que responde, para que quede en el mismo hilo. */
  readonly enRespuestaA: string | null;
  /** Hueco de reunión que viaja como invitación `.ics` (FR-024). */
  readonly reunion: MeetingSlot | null;
}

export interface MailSender {
  /** Lanza si el envío falla; el motor deja el paso `blocked` con el error. */
  enviar(correo: CorreoSaliente): Promise<{ readonly messageId: string }>;
}
