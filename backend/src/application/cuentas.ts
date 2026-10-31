import { randomUUID } from "node:crypto";

import type { Account, AccountStatus, CandidateJob, CandidateRequest } from "@jano/domain";

import { invalido } from "../domain/errores";
import type { UnidadDeTrabajo } from "../ports/db";
import { cargarCampana } from "./campanas";
import { prepararProspect } from "./motor";
import type { Servicios } from "./servicios";

/**
 * Cuentas (spec 008 US2, US3). Buscar candidatas solo encola: el trabajador de
 * cuentas (`analizar-cuentas.ts`) lee la web de cada una y la puntúa fuera de la
 * petición. Aprobar una cuenta crea su prospect y lo pone en manos del motor.
 */

export const MAX_CANDIDATAS = 50;

export async function encolarCandidatas(
  uow: UnidadDeTrabajo,
  s: Servicios,
  tenantId: string,
  campaignId: string,
  peticion: CandidateRequest,
): Promise<CandidateJob> {
  await cargarCampana(uow, campaignId);
  const jobId = randomUUID();
  const base = { tenantId, campaignId, jobId };
  const acceptedAt = s.reloj.ahora().toISOString();

  if ("region" in peticion) {
    if (!s.empresas.admite(peticion.region)) throw invalido("No reconozco esa región: indica una comunidad autónoma o una provincia.");
    await s.cola.encolar([{ tipo: "region", ...base, region: peticion.region }]);
    return { jobId, campaignId, mode: "region", region: peticion.region, queued: 0, skipped: 0, attribution: s.empresas.atribucion, acceptedAt };
  }

  const ya = await uow.cuentas.dominios(campaignId);
  const nuevos = [...new Set(peticion.domains)].filter((d) => !ya.has(d));
  await s.cola.encolar(s.manual.candidatas(nuevos).map((empresa) => ({ tipo: "cuenta" as const, ...base, empresa })));
  return {
    jobId,
    campaignId,
    mode: "domains",
    region: null,
    queued: nuevos.length,
    skipped: peticion.domains.length - nuevos.length,
    attribution: null,
    acceptedAt,
  };
}

export async function listarCuentas(uow: UnidadDeTrabajo, campaignId: string, filtro: { status: AccountStatus | null; limite: number }): Promise<Account[]> {
  await cargarCampana(uow, campaignId);
  return uow.cuentas.listar(campaignId, filtro);
}

/** Solo se aprueban las que están `found`; cada una pasa por el Contact Finder y el Orquestador. */
export async function aprobarCuentas(uow: UnidadDeTrabajo, s: Servicios, campaignId: string, ids: readonly string[]): Promise<{ approved: number }> {
  await cargarCampana(uow, campaignId);
  const aprobadas = await uow.cuentas.cambiarEstado(campaignId, ids, ["found"], "approved");
  for (const id of aprobadas) {
    const cuenta = await uow.cuentas.obtener(id);
    if (cuenta) await prepararProspect(uow, s, cuenta);
  }
  return { approved: aprobadas.length };
}

export async function descartarCuentas(uow: UnidadDeTrabajo, campaignId: string, ids: readonly string[]): Promise<{ discarded: number }> {
  await cargarCampana(uow, campaignId);
  return { discarded: (await uow.cuentas.cambiarEstado(campaignId, ids, ["found"], "discarded")).length };
}
