import type { Prospect, ProspectDetail, ProspectEvent } from "@jano/domain";

import type { Actor } from "../domain/equipo";
import { conflicto, noEncontrado } from "../domain/errores";
import { aplicarCambioDeRama } from "../domain/motor/secuencias";
import type { UnidadDeTrabajo } from "../ports/db";
import {
  aProspect,
  cargarProspect,
  contextoDe,
  detenerSecuencia,
  enviarPaso,
  planificarSiguiente,
  prospectActual,
  registrar,
} from "./motor";
import type { Servicios } from "./servicios";

/**
 * Acciones humanas sobre un prospect (spec 008 US3, US4b). Lo que el motor no
 * permite no lanza: queda un evento que lo explica y la respuesta es 409 con él.
 */

export interface ResultadoAccion {
  readonly ok: boolean;
  readonly prospect: Prospect;
  readonly event: ProspectEvent;
}

export async function detalleProspect(uow: UnidadDeTrabajo, id: string): Promise<ProspectDetail> {
  const p = await cargarProspect(uow, id);
  const { cuenta, contacto } = await contextoDe(uow, p);
  return { prospect: aProspect(p, await uow.prospects.pasos(id)), account: cuenta, contact: contacto };
}

export async function eventosProspect(uow: UnidadDeTrabajo, id: string): Promise<ProspectEvent[]> {
  await cargarProspect(uow, id);
  return uow.eventos.deProspect(id);
}

export async function detenerProspect(uow: UnidadDeTrabajo, actor: Actor, id: string): Promise<ResultadoAccion> {
  const p = await cargarProspect(uow, id);
  const r = await detenerSecuencia(uow, p, { agent: "human", type: "stopped", summary: "Secuencia detenida a mano", actor: actor.userId });
  return { ok: r.ok, prospect: await prospectActual(uow, id), event: r.evento };
}

/**
 * Aprobar un paso (FR-005): se comprueban las reglas y se envía; solo si sale se
 * aplican sus efectos (en una propuesta de cambio de rama, el cambio). Si una regla
 * lo bloquea o el envío falla, el paso queda `blocked` y nada más cambia.
 */
export async function aprobarPaso(uow: UnidadDeTrabajo, s: Servicios, actor: Actor, prospectId: string, stepId: string): Promise<ResultadoAccion> {
  const p = await cargarProspect(uow, prospectId);
  const paso = await uow.prospects.paso(stepId);
  if (!paso || paso.prospectId !== p.id) throw noEncontrado();
  if (paso.status !== "awaiting_approval") throw conflicto("Este paso no espera tu aprobación.");

  if (p.stage !== "in_sequence" && p.stage !== "waiting") {
    const event = await registrar(uow, p, {
      agent: "human",
      type: "rejected",
      summary: `Rechazado: el prospect no está en secuencia; «${paso.title}» no sale`,
      stepId: paso.id,
      actor: actor.userId,
    });
    return { ok: false, prospect: await prospectActual(uow, p.id), event };
  }

  const ahora = s.reloj.ahora();
  await uow.prospects.actualizarPaso(paso.id, { approvedAt: ahora, approvedBy: actor.userId });
  await registrar(uow, p, { agent: "human", type: "approved", summary: `Paso «${paso.title}» aprobado`, stepId: paso.id, actor: actor.userId });

  const r = await enviarPaso(uow, s, await contextoDe(uow, p), paso, { planificarSiguiente: !paso.proposal });
  if (r.tipo === "enviado" && paso.proposal === "cambio_de_rama") {
    const { omitidos, nuevos } = aplicarCambioDeRama(await uow.prospects.pasos(p.id), paso);
    await uow.prospects.marcarPasos(omitidos, "skipped");
    await uow.prospects.insertarPasos(p.id, nuevos);
    await uow.prospects.fijarSecuencia(p.id, { kind: paso.branch, switchedFrom: p.sequenceKind, switchedAt: ahora });
    await registrar(uow, p, {
      agent: "outreach",
      type: "decision",
      summary: `Secuencia cambiada a la rama por señal: ${omitidos.length} pasos consultivos omitidos y ${nuevos.length} nuevos`,
      stepId: paso.id,
    });
    await planificarSiguiente(uow, s, p.id, paso, ahora);
  }
  return { ok: r.tipo !== "bloqueado", prospect: await prospectActual(uow, p.id), event: r.evento };
}
