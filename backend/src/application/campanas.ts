import type { Campaign, CampaignStatus, CreateCampaign, IcpTurn } from "@jano/domain";

import { noEncontrado } from "../domain/errores";
import type { UnidadDeTrabajo } from "../ports/db";
import type { Servicios } from "./servicios";

/**
 * Campañas e ICP (spec 008 US1): el Orquestador estructura la frase y cada
 * corrección queda como turno en `icp_turns`; la campaña guarda el ICP vigente.
 */

export async function cargarCampana(uow: UnidadDeTrabajo, id: string): Promise<Campaign> {
  const c = await uow.campanas.obtener(id);
  if (!c) throw noEncontrado();
  return c;
}

export async function crearCampana(uow: UnidadDeTrabajo, s: Servicios, datos: CreateCampaign): Promise<{ campaign: Campaign; turn: IcpTurn }> {
  const propuesta = await s.agentes.icp.estructurar(datos.prompt);
  const id = await uow.campanas.crear({ name: propuesta.nombre, prompt: datos.prompt, icp: propuesta.icp, meetingsGoal: datos.meetingsGoal });
  await uow.campanas.anadirTurno(id, { role: "user", text: datos.prompt, icp: null, suggestions: [] });
  const turn = await uow.campanas.anadirTurno(id, { role: "jano", text: propuesta.texto, icp: propuesta.icp, suggestions: propuesta.sugerencias });
  return { campaign: await cargarCampana(uow, id), turn };
}

export async function afinarIcp(uow: UnidadDeTrabajo, s: Servicios, id: string, texto: string): Promise<IcpTurn> {
  const campana = await cargarCampana(uow, id);
  const propuesta = await s.agentes.icp.afinar(campana.icp, texto);
  await uow.campanas.anadirTurno(id, { role: "user", text: texto, icp: null, suggestions: [] });
  await uow.campanas.cambiarIcp(id, propuesta.icp);
  return uow.campanas.anadirTurno(id, { role: "jano", text: propuesta.texto, icp: propuesta.icp, suggestions: propuesta.sugerencias });
}

export async function turnosIcp(uow: UnidadDeTrabajo, id: string): Promise<IcpTurn[]> {
  await cargarCampana(uow, id);
  return uow.campanas.turnos(id);
}

export async function cambiarEstadoCampana(uow: UnidadDeTrabajo, id: string, status: CampaignStatus): Promise<Campaign> {
  await cargarCampana(uow, id);
  await uow.campanas.cambiarEstado(id, status);
  return cargarCampana(uow, id);
}
