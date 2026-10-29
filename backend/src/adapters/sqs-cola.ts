import { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";

import type { ColaDeCuentas, MensajeCuentas } from "../ports/cola";

/**
 * La cola de cuentas en SQS (estándar, con DLQ tras 3 intentos). Puede entregar un
 * mensaje dos veces: el trabajador es idempotente por campaña y dominio.
 */
export class SqsColaDeCuentas implements ColaDeCuentas {
  constructor(
    private readonly url: string,
    private readonly cliente = new SQSClient({}),
  ) {}

  async encolar(mensajes: readonly MensajeCuentas[]): Promise<void> {
    for (let i = 0; i < mensajes.length; i += 10) {
      const lote = mensajes.slice(i, i + 10);
      const r = await this.cliente.send(
        new SendMessageBatchCommand({
          QueueUrl: this.url,
          Entries: lote.map((m, j) => ({ Id: String(j), MessageBody: JSON.stringify(m) })),
        }),
      );
      if (r.Failed?.length) throw new Error(`SQS no aceptó ${r.Failed.length} mensaje(s): ${r.Failed.map((f) => f.Code).join(", ")}`);
    }
  }
}
