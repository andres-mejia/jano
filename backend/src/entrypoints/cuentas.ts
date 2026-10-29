import { DataApiDb } from "../adapters/data-api-db";
import { MensajeCuentasSchema, procesarMensaje } from "../application/analizar-cuentas";
import { requerida, serviciosDesdeEntorno } from "./servicios";

/**
 * Lambda `jano-<env>-cuentas`: consume la cola de cuentas (SQS, un mensaje por
 * invocación y como mucho 5 a la vez, para no saturar las webs ni la cuota de
 * Bedrock). Un mensaje que falla vuelve a la cola; a los 3 intentos va a la DLQ.
 */
const env = process.env;
const db = new DataApiDb({
  clusterArn: requerida(env, "CLUSTER_ARN"),
  secretArn: requerida(env, "DB_SECRET_ARN"),
  database: requerida(env, "DB_NAME"),
});
const servicios = serviciosDesdeEntorno(env, db);

interface EventoSqs {
  readonly Records: readonly { readonly messageId: string; readonly body: string }[];
}

export const handler = async (evento: EventoSqs): Promise<{ batchItemFailures: { itemIdentifier: string }[] }> => {
  const fallidos: { itemIdentifier: string }[] = [];
  for (const r of evento.Records) {
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(r.body);
    } catch {
      cuerpo = null;
    }
    const m = MensajeCuentasSchema.safeParse(cuerpo);
    if (!m.success) {
      // Mal formado no mejora reintentando: se registra y se da por consumido.
      console.log(JSON.stringify({ msg: "cuentas_mensaje_invalido", message_id: r.messageId }));
      continue;
    }
    const base = { message_id: r.messageId, tenant_id: m.data.tenantId, campaign_id: m.data.campaignId, job_id: m.data.jobId };
    try {
      const resultado = await procesarMensaje(db, servicios, m.data);
      console.log(JSON.stringify({ msg: "cuentas", ...base, ...(m.data.tipo === "cuenta" ? { dominio: m.data.empresa.dominio } : {}), ...resultado }));
    } catch (e) {
      console.log(JSON.stringify({ msg: "cuentas_error", ...base, error: e instanceof Error ? e.message : String(e) }));
      fallidos.push({ itemIdentifier: r.messageId });
    }
  }
  return { batchItemFailures: fallidos };
};
