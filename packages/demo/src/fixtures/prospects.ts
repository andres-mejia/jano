import type { Prospect, ProspectEvent } from "@jano/domain";

import { IDS } from "./ids";

const S = IDS.steps;

export const PROSPECT_RUMBO_NORTE: Prospect = {
  id: IDS.prospects.rumboNorte,
  campaignId: IDS.campaign,
  accountId: IDS.accounts.rumboNorte,
  contactId: IDS.contacts.irene,
  stage: "replied",
  sequence: {
    id: "88888888-8888-4888-8888-888888888888",
    kind: "trigger",
    switchedFrom: "consultiva",
    switchedAt: "2026-10-26T09:14:00.000Z",
    steps: [
      { id: S.dia0, day: 0, channel: "email", title: "Email personalizado", intent: "Menciona su catálogo de viajes de empresa", status: "sent", scheduledFor: "2026-10-21T08:30:00.000Z" },
      { id: S.dia3, day: 3, channel: "email", title: "Caso de uso", intent: "Ejemplo de una agencia de tamaño similar", status: "sent", scheduledFor: "2026-10-24T08:30:00.000Z" },
      { id: S.dia5, day: 5, channel: "email", title: "Email por trigger", intent: "Relaciona la vacante con la carga de prospección", status: "sent", scheduledFor: "2026-10-26T09:14:00.000Z" },
      { id: S.dia6, day: 6, channel: "whatsapp", title: "WhatsApp", intent: "Disponible porque el contacto ya ha respondido", status: "awaiting_approval", scheduledFor: "2026-10-27T10:00:00.000Z" },
      { id: S.dia7, day: 7, channel: "email", title: "Hipótesis de problema", intent: "Rama consultiva, omitida al cambiar de secuencia", status: "skipped", scheduledFor: null },
      { id: S.dia8, day: 8, channel: "email", title: "Seguimiento por email", intent: "Cancelado: la secuencia se detiene al recibir respuesta", status: "cancelled", scheduledFor: null },
      { id: S.dia12, day: 12, channel: "email", title: "Email de cierre", intent: "Rama consultiva, omitida", status: "skipped", scheduledFor: null },
    ],
  },
  nextActionAt: null,
  updatedAt: "2026-10-28T10:42:00.000Z",
};

export const PROSPECTS: Prospect[] = [
  PROSPECT_RUMBO_NORTE,
  { id: IDS.prospects.albufera, campaignId: IDS.campaign, accountId: IDS.accounts.albufera, contactId: IDS.contacts.pablo, stage: "replied", sequence: null, nextActionAt: null, updatedAt: "2026-10-28T09:42:00.000Z" },
  { id: IDS.prospects.travesia, campaignId: IDS.campaign, accountId: IDS.accounts.travesia, contactId: IDS.contacts.jorge, stage: "not_now", sequence: null, nextActionAt: "2027-01-08T08:00:00.000Z", updatedAt: "2026-10-27T16:00:00.000Z" },
  { id: IDS.prospects.mediterraneo, campaignId: IDS.campaign, accountId: IDS.accounts.mediterraneo, contactId: null, stage: "replied", sequence: null, nextActionAt: null, updatedAt: "2026-10-28T10:22:00.000Z" },
  { id: IDS.prospects.costaAzahar, campaignId: IDS.campaign, accountId: IDS.accounts.costaAzahar, contactId: null, stage: "unverified", sequence: null, nextActionAt: null, updatedAt: "2026-10-28T10:05:00.000Z" },
  { id: IDS.prospects.horizonte, campaignId: IDS.campaign, accountId: IDS.accounts.horizonte, contactId: null, stage: "opted_out", sequence: null, nextActionAt: null, updatedAt: "2026-10-28T10:44:00.000Z" },
  { id: IDS.prospects.brisa, campaignId: IDS.campaign, accountId: IDS.accounts.brisa, contactId: null, stage: "waiting", sequence: null, nextActionAt: "2026-10-29T08:30:00.000Z", updatedAt: "2026-10-28T10:31:00.000Z" },
];

function ev(partial: Omit<ProspectEvent, "evidence" | "rulesChecked" | "message" | "stepId" | "reasoning"> & Partial<ProspectEvent>): ProspectEvent {
  return { reasoning: null, evidence: [], rulesChecked: [], message: null, stepId: null, ...partial };
}

export const EVENTS: ProspectEvent[] = [
  ev({
    id: "e0000001-0000-4000-8000-000000000001",
    prospectId: IDS.prospects.rumboNorte,
    at: "2026-10-21T08:30:00.000Z",
    agent: "outreach",
    type: "decision",
    summary: "Elige secuencia consultiva: sin señal reciente en el momento de empezar",
    reasoning: "Fit alto pero sin trigger activo. La rama consultiva deja espacio para que aparezca una señal.",
    evidence: ["Fit 92 con evidencia registral y web", "Sin vacantes ni noticias en los últimos 30 días"],
    rulesChecked: [{ rule: "Email verificado por proveedor externo", passed: true, detail: "94 %" }, { rule: "No está en la lista de supresión", passed: true, detail: null }],
  }),
  ev({
    id: "e0000001-0000-4000-8000-000000000002",
    prospectId: IDS.prospects.rumboNorte,
    at: "2026-10-21T08:31:00.000Z",
    agent: "outreach",
    type: "sent",
    summary: "Email del día 0 enviado: personalizado con su catálogo de viajes de empresa",
    stepId: S.dia0,
    message: { channel: "email", subject: "Vuestros viajes de empresa", body: "Hola, Irene: he visto el catálogo de viajes de empresa de Rumbo Norte…" },
    rulesChecked: [{ rule: "Dentro del límite diario del buzón", passed: true, detail: "17 de 50" }],
  }),
  ev({
    id: "e0000001-0000-4000-8000-000000000003",
    prospectId: IDS.prospects.rumboNorte,
    at: "2026-10-24T08:30:00.000Z",
    agent: "outreach",
    type: "sent",
    summary: "Email del día 3 enviado: caso de uso de una agencia de tamaño similar",
    stepId: S.dia3,
    message: { channel: "email", subject: "Cómo lo hace una agencia como la vuestra", body: "Hola de nuevo, Irene: te cuento en tres líneas cómo una agencia de tamaño parecido…" },
    rulesChecked: [{ rule: "Dentro del límite diario del buzón", passed: true, detail: "22 de 50" }],
  }),
  ev({
    id: "e0000001-0000-4000-8000-000000000004",
    prospectId: IDS.prospects.rumboNorte,
    at: "2026-10-26T09:14:00.000Z",
    agent: "outreach",
    type: "decision",
    summary: "Cambia a secuencia por trigger: vacante de responsable comercial",
    reasoning: "Una vacante comercial indica que la prospección es prioridad ahora. Un mensaje ligado a esa señal encaja mejor que el siguiente paso consultivo.",
    evidence: ["Oferta de empleo en su web, publicada el día 5", "Facturación de 4,2 M€ en el registro", "Dos correos enviados sin respuesta"],
    rulesChecked: [],
  }),
  ev({
    id: "e0000001-0000-4000-8000-000000000005",
    prospectId: IDS.prospects.rumboNorte,
    at: "2026-10-26T09:15:00.000Z",
    agent: "outreach",
    type: "sent",
    summary: "Email por trigger enviado",
    stepId: S.dia5,
    message: {
      channel: "email",
      subject: "La vacante de responsable comercial",
      body: "Hola, Irene: he visto que buscáis responsable comercial. Mientras llega esa persona, la prospección suele quedarse parada. ¿Te cuento en 20 minutos cómo la mantienen otras agencias de vuestro tamaño?",
    },
    rulesChecked: [
      { rule: "Email verificado por proveedor externo", passed: true, detail: "94 %" },
      { rule: "No está en la lista de supresión", passed: true, detail: null },
      { rule: "Dentro del límite diario del buzón", passed: true, detail: "31 de 50" },
      { rule: "Sin respuesta previa que detenga la secuencia", passed: true, detail: null },
      { rule: "Base legal del contacto validada", passed: false, detail: "Pendiente de dictamen; permitido en entorno de pruebas" },
    ],
  }),
  ev({
    id: "e0000001-0000-4000-8000-000000000006",
    prospectId: IDS.prospects.rumboNorte,
    at: "2026-10-26T15:02:00.000Z",
    agent: "response",
    type: "replied",
    summary: "Respuesta de Irene Soler clasificada como interés",
    reasoning: "Pide saber más y menciona plazos: intención de compra alta.",
  }),
  ev({
    id: "e0000001-0000-4000-8000-000000000007",
    prospectId: IDS.prospects.rumboNorte,
    at: "2026-10-26T15:02:30.000Z",
    agent: "guardrail",
    type: "stopped",
    summary: "Seguimientos de la secuencia cancelados: el contacto ha respondido",
    rulesChecked: [{ rule: "Detener la secuencia al responder", passed: true, detail: null }],
  }),
  ev({
    id: "e0000001-0000-4000-8000-000000000008",
    prospectId: IDS.prospects.rumboNorte,
    at: "2026-10-27T10:00:00.000Z",
    agent: "outreach",
    type: "decision",
    summary: "Propone WhatsApp para fijar la reunión; espera tu aprobación",
    reasoning: "Ya hay respuesta, así que el canal está permitido. Un mensaje corto por WhatsApp suele cerrar la fecha antes que un tercer correo.",
    stepId: S.dia6,
    message: {
      channel: "whatsapp",
      subject: null,
      body: "Hola, Irene, soy Lucía, de Rumbo Norte. Gracias por tu respuesta. ¿Te viene bien el jueves a las 10:00 o el viernes a las 12:30 para esos 20 minutos? Te mando la invitación con la que elijas.",
    },
    rulesChecked: [{ rule: "WhatsApp solo tras una respuesta", passed: true, detail: "Respuesta recibida el día 5" }],
  }),
];

export const STAGE_EVENTS: ProspectEvent[] = [
  ev({ id: "e0000002-0000-4000-8000-000000000001", prospectId: IDS.prospects.rumboNorte, at: "2026-10-28T10:42:00.000Z", agent: "outreach", type: "decision", summary: "Rumbo Norte Viajes: cambia a secuencia por trigger (vacante de responsable comercial)" }),
  ev({ id: "e0000002-0000-4000-8000-000000000002", prospectId: IDS.prospects.travesia, at: "2026-10-28T10:40:00.000Z", agent: "outreach", type: "sent", summary: "Travesía Viajes: email del día 3 enviado, caso de uso de agencia similar" }),
  ev({ id: "e0000002-0000-4000-8000-000000000003", prospectId: IDS.prospects.brisa, at: "2026-10-28T10:31:00.000Z", agent: "guardrail", type: "deferred", summary: "Brisa Eventos y Viajes: envío aplazado a mañana, límite diario del buzón", rulesChecked: [{ rule: "Máximo 50 envíos por buzón y día", passed: false, detail: "50 de 50" }] }),
  ev({ id: "e0000002-0000-4000-8000-000000000004", prospectId: IDS.prospects.mediterraneo, at: "2026-10-28T10:22:00.000Z", agent: "guardrail", type: "stopped", summary: "Mediterráneo Travel Club: seguimiento cancelado, el contacto ha respondido" }),
  ev({ id: "e0000002-0000-4000-8000-000000000005", prospectId: IDS.prospects.costaAzahar, at: "2026-10-28T10:05:00.000Z", agent: "guardrail", type: "blocked", summary: "Costa Azahar Tours: no se envía, el email no supera la verificación", rulesChecked: [{ rule: "No enviar a emails sin verificar", passed: false, detail: "Rebote probable" }] }),
  ev({ id: "e0000002-0000-4000-8000-000000000006", prospectId: IDS.prospects.albufera, at: "2026-10-28T09:51:00.000Z", agent: "outreach", type: "decision", summary: "Viajes Albufera: elige secuencia consultiva, sin señal reciente" }),
];
