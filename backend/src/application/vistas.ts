import type {
  AgentActivity,
  AuditEntry,
  ComplianceSummary,
  Connection,
  DashboardSummary,
  FlowMap,
  FlowNode,
  Guardrails,
  Opportunity,
  PendingDecision,
  ProspectEvent,
  ProspectStage,
} from "@jano/domain";

import type { Actor } from "../domain/equipo";
import { prohibido } from "../domain/errores";
import { inicioDelDiaEnMadrid } from "../domain/motor/tiempo";
import type { UnidadDeTrabajo } from "../ports/db";
import { cargarCampana } from "./campanas";
import type { Servicios } from "./servicios";

/**
 * Vistas (FR-006): centro de mando, flujo, auditoría y cumplimiento, proyectadas
 * del registro de eventos con SQL. La lectura del Orquestador sobre la campaña es
 * la última revisión guardada; aquí no se llama a ningún agente.
 */

const OBJETIVO_POR_DEFECTO = 12;
const RECIENTE_MS = 10 * 60_000;

const INTENCION: Readonly<Record<string, string>> = {
  interest: "Interés: propuesta de reunión lista",
  objection: "Objeción, borrador listo",
  not_now: "«Ahora no», borrador listo",
  out_of_office: "Ausencia",
  opt_out: "Baja",
  wrong_person: "No es la persona, borrador listo",
  other: "Respuesta, borrador listo",
};

export async function centroDeMando(uow: UnidadDeTrabajo, s: Servicios): Promise<DashboardSummary> {
  const ahora = s.reloj.ahora();
  const campana = await uow.campanas.principal();
  const pend = await uow.vistas.pendientes();
  const guardarrailes = await uow.cumplimiento.guardarrailes();
  const hoy = inicioDelDiaEnMadrid(ahora);
  const enviosHoy = await uow.eventos.enviosDesde(hoy);
  const aplazados = await uow.vistas.aplazadosDesde(hoy);

  const pending: PendingDecision[] = [
    ...pend.borradores.map((b) => ({
      id: b.id,
      kind: "inbox_draft" as const,
      title: b.accountName,
      subtitle: INTENCION[b.intent] ?? "Borrador listo",
      href: `/bandeja?item=${b.id}`,
    })),
    ...pend.pasos.map((p) => ({ id: p.stepId, kind: "step_approval" as const, title: p.accountName, subtitle: `«${p.title}» espera tu OK`, href: `/prospects/${p.prospectId}` })),
  ];
  const guardrailNotice =
    enviosHoy >= guardarrailes.maxSendsPerMailboxPerDay
      ? `Límite diario del buzón alcanzado (${enviosHoy} de ${guardarrailes.maxSendsPerMailboxPerDay})${aplazados ? `: ${aplazados} envíos pasan a mañana` : ""}.`
      : null;
  const meetingsByWeek = await uow.vistas.reunionesPorSemana(ahora, 5);
  const upcomingMeetings = (await uow.vistas.proximasReuniones(ahora)).map((r) => ({ ...r, status: "proposed" as const }));

  if (!campana) {
    const kpi = { value: 0, note: "Sin campaña", trend: [0, 0, 0, 0, 0, 0] };
    return {
      campaignId: null,
      campaignName: null,
      kpis: { accountsFound: kpi, contactsVerified: kpi, openConversations: kpi, meetingsBooked: kpi },
      meetingsGoal: OBJETIVO_POR_DEFECTO,
      funnel: [],
      agents: [],
      guardrailNotice,
      insight: null,
      pending,
      meetingsByWeek,
      upcomingMeetings,
    };
  }

  const id = campana.id;
  const cuentas = await uow.vistas.cuentas(id);
  const alcanzadas = await uow.vistas.alcanzadas(id);
  const actuales = await uow.vistas.actuales(id);
  const embudo = await uow.vistas.embudo(id);
  const t = await uow.vistas.tendencias(id, ahora);
  const revision = await uow.campanas.ultimaRevision(id);
  if (cuentas.porRevisar) {
    pending.push({ id, kind: "accounts_approval", title: `${cuentas.porRevisar} cuentas nuevas`, subtitle: "Aprobar antes de buscar contactos", href: `/campanas/${id}` });
  }

  const agents: AgentActivity[] = (await uow.vistas.ultimaActividad(id)).map((a) => {
    const esperan = a.agent === "outreach" ? pend.pasos.length : a.agent === "response" ? pend.borradores.length : 0;
    if (esperan) return { agent: a.agent, status: "waiting_human", summary: `${esperan} ${esperan === 1 ? "borrador espera" : "borradores esperan"} tu aprobación`, at: a.at };
    return { agent: a.agent, status: ahora.getTime() - Date.parse(a.at) < RECIENTE_MS ? "working" : "idle", summary: a.summary, at: a.at };
  });

  return {
    campaignId: id,
    campaignName: campana.name,
    kpis: {
      accountsFound: { value: cuentas.total, note: `${cuentas.fitAlto} con fit alto`, trend: t.cuentas },
      contactsVerified: { value: alcanzadas.enriched ?? 0, note: "Con origen registrado", trend: t.contactos },
      openConversations: { value: actuales.replied ?? 0, note: `${pend.borradores.length} esperan aprobación`, trend: t.conversaciones },
      meetingsBooked: { value: embudo.reuniones, note: `Objetivo: ${campana.meetingsGoal}`, trend: t.reuniones },
    },
    meetingsGoal: campana.meetingsGoal,
    funnel: [
      { key: "found", label: "Encontradas", value: cuentas.total },
      { key: "high_fit", label: "Fit alto", value: cuentas.fitAlto },
      { key: "contacted", label: "Contactadas", value: embudo.contactados },
      { key: "replied", label: "Respondieron", value: embudo.respondieron },
      { key: "meetings", label: "Reuniones", value: embudo.reuniones },
    ],
    agents,
    guardrailNotice,
    insight: revision ? { text: revision.lectura, action: revision.propuesta?.texto ?? null } : null,
    pending: pending.slice(0, 10),
    meetingsByWeek,
    upcomingMeetings,
  };
}

export async function mapaDeFlujo(uow: UnidadDeTrabajo, campaignId: string): Promise<FlowMap> {
  const campana = await cargarCampana(uow, campaignId);
  const cuentas = await uow.vistas.cuentas(campaignId);
  const alcanzadas = await uow.vistas.alcanzadas(campaignId);
  const actuales = await uow.vistas.actuales(campaignId);
  const revision = await uow.campanas.ultimaRevision(campaignId);
  const n = (e: ProspectStage) => alcanzadas[e] ?? 0;
  const ahora = (e: ProspectStage) => actuales[e] ?? 0;
  const activa = revision?.cuello === "waiting" ? "in_sequence" : (revision?.cuello ?? null);

  const nodos: [FlowNode["stage"], string, number, string][] = [
    ["icp", "ICP", 1, "1 campaña"],
    ["found", "Account Finder", cuentas.total, "cuentas"],
    ["enriched", "Contact Finder", n("enriched"), "contactos"],
    ["in_sequence", "Outreach", n("in_sequence"), "en secuencia"],
    ["replied", "Response", n("replied"), "respuestas"],
    ["meeting", "Reunión", n("meeting"), "agendadas"],
  ];
  return {
    campaignId,
    campaignName: campana.name,
    nodes: nodos.map(([stage, label, value, note]) => ({ stage, label, value, note, active: stage === activa })),
    exits: [
      { afterStage: "found", label: "Descartadas", value: cuentas.descartadas, note: "sin fit o web no legible" },
      { afterStage: "enriched", label: "Sin verificar", value: ahora("unverified"), note: "no se enviará" },
      { afterStage: "in_sequence", label: "En espera", value: ahora("waiting"), note: "límite de envío" },
      { afterStage: "replied", label: "Ahora no · bajas", value: ahora("not_now") + ahora("opted_out"), note: `${ahora("not_now")} y ${ahora("opted_out")}` },
    ],
    bottleneck:
      revision?.cuello && revision.propuesta
        ? { stage: revision.cuello, text: revision.lectura, option: revision.propuesta.texto, effect: revision.propuesta.efecto }
        : null,
  };
}

export async function eventosDeEtapa(uow: UnidadDeTrabajo, campaignId: string, stage: ProspectStage, limite: number): Promise<ProspectEvent[]> {
  await cargarCampana(uow, campaignId);
  return uow.vistas.eventosEnEtapa(campaignId, stage, limite);
}

export const auditoria = (uow: UnidadDeTrabajo, limite: number): Promise<AuditEntry[]> => uow.vistas.auditoria(limite);

/** Sin proveedor de entregabilidad todavía: no se inventa la salud del dominio (llega con SES, fase C). */
export async function resumenCumplimiento(uow: UnidadDeTrabajo, s: Servicios): Promise<ComplianceSummary> {
  const g = await uow.cumplimiento.guardarrailes();
  const contactos = await uow.cumplimiento.contactos();
  const bajas = await uow.cumplimiento.bajas();
  return {
    sendsToday: await uow.eventos.enviosDesde(inicioDelDiaEnMadrid(s.reloj.ahora())),
    sendsLimit: g.maxSendsPerMailboxPerDay,
    contactsWithSource: contactos.conOrigen,
    contactsTotal: contactos.total,
    optOutsHandled: bajas.atendidas,
    optOutsTotal: bajas.total,
    legalBasisValidatedPct: contactos.total ? Math.round((contactos.baseValidada / contactos.total) * 100) : 0,
    legalOpinionPending: true,
    domains: [],
  };
}

/** Activar el piloto automático exige ser owner (contrato `setGuardrails`); queda quién lo cambió. */
export async function cambiarGuardarrailes(uow: UnidadDeTrabajo, actor: Actor, g: Guardrails): Promise<Guardrails> {
  const actual = await uow.cumplimiento.guardarrailes();
  if (g.autopilot && !actual.autopilot && actor.role !== "owner") throw prohibido("Solo el responsable de la cuenta puede activar el piloto automático.");
  return uow.cumplimiento.guardarGuardarrailes(g, actor.userId);
}

export const conexiones = (s: Servicios): Connection[] => [...s.config.conexiones];

export const oportunidades = (uow: UnidadDeTrabajo): Promise<Opportunity[]> => uow.bandeja.oportunidades();

// ── CSV para Excel en español ────────────────────────────────────────────

const FECHA_MADRID = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const celda = (v: string | null): string => {
  const t = v ?? "";
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const fecha = (iso: string | null) => (iso ? FECHA_MADRID.format(new Date(iso)) : "");

const ESTADO: Readonly<Record<Opportunity["status"], string>> = { open: "Abierta", won: "Ganada", lost: "Perdida" };

/** Separador `;`, fin de línea CRLF y BOM UTF-8: Excel en español lo abre con tildes y columnas. */
export function oportunidadesCsv(lista: readonly Opportunity[]): string {
  const cabecera = ["Empresa", "Dominio", "Contacto", "Cargo", "Email", "Reunión", "Estado", "Campaña", "Creada"];
  const filas = lista.map((o) =>
    [o.accountName, o.domain, o.contactName, o.contactRole, o.contactEmail, fecha(o.meetingStart), ESTADO[o.status], o.campaignName, fecha(o.createdAt)].map(celda).join(";"),
  );
  return `﻿${[cabecera.join(";"), ...filas].join("\r\n")}\r\n`;
}
