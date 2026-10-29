import type { Account, AccountStatus, CandidateRequest, CandidateResult } from "@jano/domain";

import type { UnidadDeTrabajo } from "../ports/db";
import type { EmpresaCandidata } from "../ports/web";
import { cargarCampana } from "./campanas";
import { prepararProspect } from "./motor";
import type { Servicios } from "./servicios";

/**
 * Cuentas (spec 008 US2, US3). El Account Finder lee la web de cada candidata y
 * la puntúa; una web que no se puede leer queda descartada con el motivo, sin fit
 * inventado. Aprobar una cuenta crea su prospect y lo pone en manos del motor.
 */

export const MAX_CANDIDATAS = 50;

const nombreDeDominio = (d: string) => {
  const base = d.split(".")[0] ?? d;
  return base.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
};

export async function buscarCandidatas(uow: UnidadDeTrabajo, s: Servicios, campaignId: string, peticion: CandidateRequest): Promise<CandidateResult> {
  const campana = await cargarCampana(uow, campaignId);
  const candidatas: EmpresaCandidata[] =
    "region" in peticion
      ? await s.empresas.buscar(peticion.region, MAX_CANDIDATAS)
      : peticion.domains.map((d) => ({ nombre: nombreDeDominio(d), dominio: d, ciudad: null, origen: "manual" }));

  const ya = await uow.cuentas.dominios(campaignId);
  const nuevas: EmpresaCandidata[] = [];
  let skipped = 0;
  for (const e of candidatas) {
    if (ya.has(e.dominio)) skipped++;
    else if (nuevas.length < MAX_CANDIDATAS) {
      ya.add(e.dominio);
      nuevas.push(e);
    }
  }

  const accounts: Account[] = [];
  for (const empresa of nuevas) {
    const base = { campaignId, name: empresa.nombre, domain: empresa.dominio, city: empresa.ciudad, source: empresa.origen };
    const lectura = await s.web.leer(empresa.dominio);
    if (!lectura.ok) {
      accounts.push(
        await uow.cuentas.insertar({
          ...base,
          fitScore: 0,
          fitReasoning: `Sin puntuar: ${lectura.motivo}`,
          fitEvidence: [],
          trigger: null,
          status: "discarded",
          discardReason: lectura.motivo,
        }),
      );
      continue;
    }
    const p = await s.agentes.cuentas.puntuar({ icp: campana.icp, empresa, paginas: lectura.paginas });
    accounts.push(
      await uow.cuentas.insertar({
        ...base,
        fitScore: p.fitScore,
        fitReasoning: p.razonamiento,
        fitEvidence: p.evidencia,
        trigger: p.senal,
        status: "found",
        discardReason: null,
      }),
    );
  }
  const discarded = accounts.filter((a) => a.status === "discarded").length;
  return { added: accounts.length - discarded, discarded, skipped, accounts };
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
