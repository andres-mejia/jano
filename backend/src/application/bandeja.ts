import type { ApproveDraft, DraftStatus, InboxItem, RegenerateDraft, ReplyIntent } from "@jano/domain";

import type { Actor } from "../domain/equipo";
import { conflicto, noEncontrado } from "../domain/errores";
import { DIAS_SEGUIMIENTO_AHORA_NO } from "../domain/motor/bandeja";
import type { UnidadDeTrabajo } from "../ports/db";
import type { ElementoGuardado } from "../ports/repositorios";
import { cargarProspect, comprobarReglas, contextoDe, destinatario, planificarSeguimiento, registrar, transicionar } from "./motor";
import type { Servicios } from "./servicios";

/**
 * Bandeja (spec 008 US4, US5). Aprobar un borrador ejecuta los efectos que muestra
 * en una transacción (FR-005): reglas, envío y, solo si sale, reunión, oportunidad o
 * seguimiento. Si no sale, el borrador sigue pendiente y el evento lo explica.
 */

const sinMessageId = ({ messageId: _, ...item }: ElementoGuardado): InboxItem => item;

async function cargar(uow: UnidadDeTrabajo, id: string): Promise<ElementoGuardado> {
  const e = await uow.bandeja.obtener(id);
  if (!e) throw noEncontrado();
  return e;
}

export const listarBandeja = (uow: UnidadDeTrabajo, filtro: { intent: ReplyIntent | null; status: DraftStatus | null }) => uow.bandeja.listar(filtro);

export async function elementoBandeja(uow: UnidadDeTrabajo, id: string): Promise<InboxItem> {
  return sinMessageId(await cargar(uow, id));
}

function borradorPendiente(e: ElementoGuardado) {
  if (!e.draft || e.draft.status !== "pending_approval") throw conflicto("Este elemento no tiene un borrador pendiente.");
  return e.draft;
}

export type ResultadoAprobacion = { readonly ok: true; readonly item: InboxItem } | { readonly ok: false; readonly motivo: string };

export async function aprobarBorrador(uow: UnidadDeTrabajo, s: Servicios, actor: Actor, id: string, edicion: ApproveDraft): Promise<ResultadoAprobacion> {
  const e = await cargar(uow, id);
  const draft = borradorPendiente(e);
  let p = await cargarProspect(uow, e.prospectId);
  const c = await contextoDe(uow, p);
  const asunto = edicion.subject ?? draft.subject;
  const cuerpo = edicion.body ?? draft.body;
  const ahora = s.reloj.ahora();

  const ev = await comprobarReglas(uow, s, c, new Date(e.receivedAt), true);
  const v = ev.veredicto;
  if (v.tipo !== "enviar") {
    await registrar(uow, p, {
      agent: "guardrail",
      type: v.tipo === "aplazar" ? "deferred" : "blocked",
      summary: `No sale la contestación a ${e.contactName}: ${v.detalle}`,
      rulesChecked: ev.comprobadas,
      ruleApplied: v.regla,
      actor: actor.userId,
    });
    return { ok: false, motivo: v.tipo === "aplazar" ? `El buzón ha llegado a su límite diario (${v.detalle}); apruébalo de nuevo mañana.` : `No se envía: ${v.detalle}.` };
  }

  const reunion = e.effects.includes("hold_slots") ? (draft.slots[0] ?? null) : null;
  try {
    await s.correo.enviar({
      para: c.contacto?.email ?? "",
      asunto: asunto ?? `Re: ${c.cuenta.name}`,
      cuerpo,
      token: p.token,
      idempotencia: e.id,
      enRespuestaA: e.messageId,
      reunion,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await registrar(uow, p, {
      agent: "guardrail",
      type: "blocked",
      summary: `El envío de la contestación a ${e.contactName} ha fallado; no se ha aplicado ningún efecto`,
      reasoning: error,
      rulesChecked: ev.comprobadas,
      actor: actor.userId,
    });
    return { ok: false, motivo: "El envío ha fallado; el borrador sigue pendiente." };
  }

  await registrar(uow, p, { agent: "human", type: "approved", summary: `Contestación a ${e.contactName} aprobada`, actor: actor.userId });
  await registrar(uow, p, {
    agent: "response",
    type: "sent",
    summary: `Contestación enviada${reunion ? " con invitación de calendario" : ""}`,
    rulesChecked: ev.comprobadas,
    message: { channel: "email", subject: asunto, body: cuerpo },
  });
  await uow.bandeja.cambiarBorrador(e.id, {
    ...draft,
    subject: asunto,
    body: cuerpo,
    status: "sent",
    slots: draft.slots.map((h) => (reunion && h.start === reunion.start ? { ...h, held: true } : h)),
  });

  if (e.effects.includes("create_opportunity")) {
    await uow.bandeja.crearOportunidad({ prospectId: p.id, campaignId: p.campaignId, inboxItemId: e.id, meetingStart: reunion?.start ?? null, meetingEnd: reunion?.end ?? null });
    p = (
      await transicionar(uow, p, "meeting", {
        agent: "response",
        type: "meeting_booked",
        summary: reunion ? `Reunión propuesta para el ${reunion.start.slice(0, 10)}; oportunidad creada` : "Reunión acordada; oportunidad creada",
        actor: actor.userId,
      })
    ).prospect;
  }
  if (e.effects.includes("schedule_follow_up") && e.intent === "not_now") {
    const t = await transicionar(uow, p, "not_now", { agent: "response", type: "decision", summary: `Lo retoma dentro de ${DIAS_SEGUIMIENTO_AHORA_NO} días de secuencia` });
    if (t.ok) {
      const cuando = new Date(ahora.getTime() + DIAS_SEGUIMIENTO_AHORA_NO * s.config.minutosPorDia * 60_000);
      await planificarSeguimiento(uow, s, t.prospect, cuando, "Retomar el contacto", "Volver a escribir tras su «ahora no»");
    }
  }
  return { ok: true, item: await elementoBandeja(uow, e.id) };
}

export async function descartarBorrador(uow: UnidadDeTrabajo, actor: Actor, id: string): Promise<InboxItem> {
  const e = await cargar(uow, id);
  const draft = borradorPendiente(e);
  await uow.bandeja.cambiarBorrador(e.id, { ...draft, status: "discarded" });
  const p = await cargarProspect(uow, e.prospectId);
  await registrar(uow, p, { agent: "human", type: "decision", summary: `Borrador de contestación a ${e.contactName} descartado`, actor: actor.userId });
  return elementoBandeja(uow, e.id);
}

export async function regenerarBorrador(uow: UnidadDeTrabajo, s: Servicios, id: string, peticion: RegenerateDraft): Promise<InboxItem> {
  const e = await cargar(uow, id);
  if (!e.draft || e.draft.status === "sent") throw conflicto("Este borrador ya no se puede regenerar.");
  const p = await cargarProspect(uow, e.prospectId);
  const c = await contextoDe(uow, p);
  const b = await s.agentes.redactor.redactarRespuesta({
    cuenta: c.cuenta,
    contacto: destinatario(c.contacto),
    respuesta: e.text,
    intent: e.intent,
    huecos: e.draft.slots,
    tono: peticion.tone,
  });
  await uow.bandeja.cambiarBorrador(e.id, { ...e.draft, subject: b.asunto, body: b.cuerpo, confidence: b.confianza, status: "pending_approval" });
  return elementoBandeja(uow, e.id);
}
