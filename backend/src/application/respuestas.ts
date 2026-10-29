import { proponerHuecos } from "../domain/motor/huecos";
import { EFECTOS } from "../domain/motor/bandeja";
import { pendientes } from "../domain/motor/secuencias";
import type { UnidadDeTrabajo } from "../ports/db";
import { cargarProspect, contextoDe, decidir, destinatario, eventoDecision, planificarSeguimiento, registrar, transicionar } from "./motor";
import type { Servicios } from "./servicios";

/**
 * Lo que entra (spec 008 US4): una respuesta detiene la secuencia en la misma
 * transacción y deja un borrador en la bandeja; una baja pasa a supresión sin
 * esperar aprobación. La Lambda de entrada (fase C) y el enlace de baja llaman aquí.
 */

export interface RespuestaEntrante {
  readonly prospectId: string;
  readonly texto: string;
  readonly recibidaEn: Date;
  readonly messageId: string | null;
}

export async function registrarRespuesta(uow: UnidadDeTrabajo, s: Servicios, r: RespuestaEntrante): Promise<{ inboxItemId: string }> {
  let p = await cargarProspect(uow, r.prospectId);
  const { intent, razonamiento } = await s.agentes.respuestas.clasificar({ texto: r.texto });

  const cancelados = pendientes(await uow.prospects.pasos(p.id));
  await uow.prospects.marcarPasos(cancelados, "cancelled");
  p = (
    await transicionar(uow, p, "replied", {
      agent: "response",
      type: "replied",
      summary: `Respuesta clasificada como ${intent}`,
      reasoning: razonamiento,
      message: { channel: "email", subject: null, body: r.texto },
    })
  ).prospect;
  if (cancelados.length) {
    await registrar(uow, p, {
      agent: "guardrail",
      type: "stopped",
      summary: `${cancelados.length} pasos cancelados: el contacto ha respondido`,
      rulesChecked: [{ rule: "Detener la secuencia al responder", passed: true, detail: null }],
      ruleApplied: "Detener la secuencia al responder",
    });
  }

  const c = await contextoDe(uow, p);
  const base = { prospectId: p.id, receivedAt: r.recibidaEn, channel: "email" as const, text: r.texto, intent, intentReasoning: razonamiento, messageId: r.messageId };

  if (intent === "opt_out") {
    if (c.contacto) await uow.cumplimiento.suprimir(c.contacto.email, "respuesta", p.id);
    await transicionar(uow, p, "opted_out", {
      agent: "response",
      type: "opt_out",
      summary: "Pide la baja: pasa a la lista de supresión",
      ruleApplied: "Bajas al instante",
      rulesChecked: [{ rule: "Bajas al instante", passed: true, detail: null }],
    });
    return { inboxItemId: await uow.bandeja.insertar({ ...base, draft: null, effects: EFECTOS.opt_out }) };
  }

  const decision = await decidir(uow, s, c, "respuesta_clasificada", { intent });
  if (decision.accion.tipo === "esperar_hasta") {
    const cuando = new Date(decision.accion.at);
    const t = await transicionar(uow, p, "in_sequence", eventoDecision(decision, null));
    if (t.ok) await planificarSeguimiento(uow, s, t.prospect, cuando, "Retomar tras la ausencia", "Volver a escribir cuando esté de vuelta");
    return { inboxItemId: await uow.bandeja.insertar({ ...base, draft: null, effects: ["schedule_follow_up"] }) };
  }

  await registrar(uow, p, eventoDecision(decision, null));
  const huecos = intent === "interest" ? proponerHuecos(s.reloj.ahora()) : [];
  const b = await s.agentes.redactor.redactarRespuesta({ cuenta: c.cuenta, contacto: destinatario(c.contacto), respuesta: r.texto, intent, huecos, tono: null });
  const id = await uow.bandeja.insertar({
    ...base,
    draft: { channel: "email", subject: b.asunto, body: b.cuerpo, slots: huecos, confidence: b.confianza, status: "pending_approval" },
    effects: EFECTOS[intent],
  });
  return { inboxItemId: id };
}

/**
 * Baja desde el enlace del pie (FR-022): supresión inmediata y secuencia detenida.
 * Idempotente: pulsar dos veces no registra dos bajas.
 */
export async function darDeBaja(uow: UnidadDeTrabajo, prospectId: string): Promise<void> {
  const p = await cargarProspect(uow, prospectId);
  const { contacto } = await contextoDe(uow, p);
  if (contacto && (await uow.cumplimiento.suprimido(contacto.email)) && p.stage === "opted_out") return;
  if (contacto) await uow.cumplimiento.suprimir(contacto.email, "enlace_baja", p.id);
  await uow.prospects.marcarPasos(pendientes(await uow.prospects.pasos(p.id)), "cancelled");
  await transicionar(uow, p, "opted_out", {
    agent: "guardrail",
    type: "opt_out",
    summary: "Baja desde el enlace del correo: pasa a la lista de supresión",
    ruleApplied: "Bajas al instante",
    rulesChecked: [{ rule: "Bajas al instante", passed: true, detail: null }],
  });
}
