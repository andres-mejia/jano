import type { AuditEntry, ComplianceSummary, Connection, DashboardSummary, FlowMap, Guardrails } from "@jano/domain";
import { DEFAULT_GUARDRAILS } from "@jano/domain";

import { IDS } from "./ids";

/** Hace `min` minutos, para que «Agentes en vivo» diga «hace 2 min» y no «hace 23 h». */
const haceMin = (min: number): string => new Date(Date.now() - min * 60_000).toISOString();

/** Se calcula en cada petición: en una Lambda que lleva horas viva, la hora no se queda vieja. */
export function agentesEnVivo(): DashboardSummary["agents"] {
  return [
    { agent: "account_finder", status: "working", summary: "Leyendo 14 webs corporativas", at: haceMin(1) },
    { agent: "contact_finder", status: "working", summary: "Verificando 6 emails", at: haceMin(1) },
    { agent: "outreach", status: "deciding", summary: "Cambia Rumbo Norte a secuencia por trigger", at: haceMin(5) },
    { agent: "response", status: "waiting_human", summary: "2 borradores esperan tu aprobación", at: haceMin(13) },
  ];
}

export const DASHBOARD: DashboardSummary = {
  campaignId: IDS.campaign,
  campaignName: "Agencias de viajes · España · facturación superior a 1 M€",
  kpis: {
    accountsFound: { value: 312, note: "148 con fit alto", trend: [2, 5, 9, 14, 22, 31] },
    contactsVerified: { value: 187, note: "Con origen registrado", trend: [1, 3, 6, 9, 14, 19] },
    openConversations: { value: 23, note: "5 esperan aprobación", trend: [0, 1, 2, 2, 4, 6] },
    meetingsBooked: { value: 7, note: "Objetivo: 12", trend: [0, 1, 1, 2, 3, 3.2] },
  },
  meetingsGoal: 12,
  funnel: [
    { key: "found", label: "Encontradas", value: 312 },
    { key: "high_fit", label: "Fit alto", value: 148 },
    { key: "contacted", label: "Contactadas", value: 96 },
    { key: "replied", label: "Respondieron", value: 23 },
    { key: "meetings", label: "Reuniones", value: 7 },
  ],
  agents: agentesEnVivo(),
  guardrailNotice: "Límite diario del buzón alcanzado: 12 envíos pasan a mañana.",
  insight: {
    text: "Las cuentas con vacante comercial responden tres veces más. Propongo priorizarlas esta semana.",
    action: "Aplicar",
  },
  pending: [
    { id: IDS.inbox.albufera, kind: "inbox_draft", title: "Viajes Albufera", subtitle: "Respuesta con propuesta de reunión", href: `/bandeja?item=${IDS.inbox.albufera}` },
    { id: IDS.inbox.mediterraneo, kind: "inbox_draft", title: "Mediterráneo Travel Club", subtitle: "Objeción de precio, borrador listo", href: `/bandeja?item=${IDS.inbox.mediterraneo}` },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", kind: "accounts_approval", title: "18 cuentas nuevas", subtitle: "Aprobar antes de buscar contactos", href: `/campanas/${IDS.campaign}` },
  ],
  meetingsByWeek: [
    { week: "S40", count: 0 },
    { week: "S41", count: 1 },
    { week: "S42", count: 1 },
    { week: "S43", count: 2 },
    { week: "S44", count: 3 },
  ],
  upcomingMeetings: [
    { id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1", accountName: "Rumbo Norte Viajes", contactName: "Irene Soler", start: "2026-11-05T09:00:00.000Z", status: "confirmed" },
    { id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd2", accountName: "Brisa Eventos y Viajes", contactName: "Nuria Vidal", start: "2026-11-10T15:30:00.000Z", status: "proposed" },
    { id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd3", accountName: "Viajes Albufera", contactName: "Pablo Ferrer", start: "2026-11-05T09:00:00.000Z", status: "draft" },
  ],
};

export const FLOW: FlowMap = {
  campaignId: IDS.campaign,
  campaignName: "Agencias de viajes",
  nodes: [
    { stage: "icp", label: "ICP", value: 1, note: "1 campaña", active: false },
    { stage: "found", label: "Account Finder", value: 312, note: "cuentas", active: false },
    { stage: "enriched", label: "Contact Finder", value: 187, note: "contactos", active: false },
    { stage: "in_sequence", label: "Outreach", value: 96, note: "en secuencia", active: true },
    { stage: "replied", label: "Response", value: 23, note: "respuestas", active: false },
    { stage: "meeting", label: "Reunión", value: 7, note: "agendadas", active: false },
  ],
  exits: [
    { afterStage: "found", label: "Descartadas", value: 164, note: "sin fit o < 1 M€" },
    { afterStage: "enriched", label: "Sin verificar", value: 39, note: "no se enviará" },
    { afterStage: "in_sequence", label: "En espera", value: 52, note: "límite de envío" },
    { afterStage: "replied", label: "Ahora no · bajas", value: 9, note: "6 y 3" },
  ],
  bottleneck: {
    stage: "in_sequence",
    text: "El cuello de botella está en Outreach: 52 prospects esperan por el límite de envío.",
    option: "Añadir un segundo buzón",
    effect: "Cola vacía en 3 días",
  },
};

export const COMPLIANCE: ComplianceSummary = {
  sendsToday: 38,
  sendsLimit: 50,
  contactsWithSource: 187,
  contactsTotal: 187,
  optOutsHandled: 3,
  optOutsTotal: 3,
  legalBasisValidatedPct: 0,
  legalOpinionPending: true,
  domains: [
    { domain: "rumbo-hola.example", spf: true, dkim: true, dmarc: true, warmupDay: 12, warmupTotalDays: 21, bounceRatePct: 1.1, complaints: 0 },
  ],
};

export const GUARDRAILS: Guardrails = { ...DEFAULT_GUARDRAILS };

export const AUDIT: AuditEntry[] = [
  { id: "f0000000-0000-4000-8000-000000000001", at: "2026-10-28T10:44:00.000Z", agent: "response", type: "opt_out", prospectId: IDS.prospects.horizonte, accountName: "Horizonte Grupos", summary: "Pide la baja: pasa a la lista de supresión", ruleApplied: "Bajas al instante" },
  { id: "f0000000-0000-4000-8000-000000000002", at: "2026-10-28T10:42:00.000Z", agent: "outreach", type: "decision", prospectId: IDS.prospects.rumboNorte, accountName: "Rumbo Norte Viajes", summary: "Cambio de secuencia por trigger", ruleApplied: null },
  { id: "f0000000-0000-4000-8000-000000000003", at: "2026-10-28T10:31:00.000Z", agent: "guardrail", type: "deferred", prospectId: IDS.prospects.brisa, accountName: "Brisa Eventos y Viajes", summary: "Envío aplazado, buzón al límite", ruleApplied: "Máximo 50 envíos por buzón y día" },
  { id: "f0000000-0000-4000-8000-000000000004", at: "2026-10-28T10:05:00.000Z", agent: "guardrail", type: "blocked", prospectId: IDS.prospects.costaAzahar, accountName: "Costa Azahar Tours", summary: "Email sin verificar, no se envía", ruleApplied: "No enviar a emails sin verificar" },
  { id: "f0000000-0000-4000-8000-000000000005", at: "2026-10-28T09:42:00.000Z", agent: "response", type: "replied", prospectId: IDS.prospects.albufera, accountName: "Viajes Albufera", summary: "Clasificada como interés", ruleApplied: null },
  { id: "f0000000-0000-4000-8000-000000000006", at: "2026-10-28T09:30:00.000Z", agent: "contact_finder", type: "decision", prospectId: IDS.prospects.travesia, accountName: "Travesía Viajes", summary: "Contacto guardado con su origen", ruleApplied: "Origen y base legal por dato" },
  { id: "f0000000-0000-4000-8000-000000000007", at: "2026-10-28T09:14:00.000Z", agent: "outreach", type: "sent", prospectId: IDS.prospects.rumboNorte, accountName: "Rumbo Norte Viajes", summary: "Email por trigger enviado", ruleApplied: null },
];

export const CONNECTIONS: Connection[] = [
  { kind: "microsoft365", name: "Microsoft 365", detail: "Buzón hola@rumbo-hola.example · Graph API", status: "connected", lastCheckedAt: "2026-10-28T10:45:00.000Z" },
  { kind: "company_data", name: "Datos de empresas", detail: "Registro mercantil · proveedor por cotizar", status: "not_configured", lastCheckedAt: null },
  { kind: "email_verification", name: "Verificación de email", detail: "Proveedor externo", status: "connected", lastCheckedAt: "2026-10-28T10:45:00.000Z" },
  { kind: "calendar", name: "Calendario", detail: "Microsoft 365 · huecos de 30 minutos", status: "connected", lastCheckedAt: "2026-10-28T10:45:00.000Z" },
  { kind: "crm", name: "CRM o Excel", detail: "Exportación a Excel activa · HubSpot sin configurar", status: "not_configured", lastCheckedAt: null },
  { kind: "llm", name: "Modelo de IA", detail: "Amazon Bedrock · eu-west-1", status: "connected", lastCheckedAt: "2026-10-28T10:45:00.000Z" },
];
