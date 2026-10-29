/**
 * Resolución de las rutas del contrato con datos de ejemplo. La usan la app en
 * modo mock y la API (`backend/`) para las rutas que la spec 003 aún no sirve.
 * Mantiene estado en memoria para que las acciones (aprobar, descartar,
 * detener) se reflejen mientras dure el proceso. Las rutas replican
 * `contracts/openapi/jano-api.yaml`; una ruta que no está aquí falla con 404
 * para que el hueco se vea.
 */

import type { Campaign, IcpTurn, InboxItem, Prospect, ProspectEvent, TenantUser } from "@jano/domain";
import { ApproveDraftSchema, CreateCampaignSchema, GuardrailsSchema, InviteTenantUserSchema, RegenerateDraftSchema } from "@jano/domain";

import { ACCOUNTS, CAMPAIGN, CONTACTS, ICP_TURNS } from "./fixtures/campaign";
import { IDS, nextMockId } from "./fixtures/ids";
import { INBOX } from "./fixtures/inbox";
import { EVENTS, PROSPECTS, STAGE_EVENTS } from "./fixtures/prospects";
import { TEAM, TENANT } from "./fixtures/team";
import { AUDIT, COMPLIANCE, CONNECTIONS, DASHBOARD, FLOW, GUARDRAILS } from "./fixtures/views";

export class DemoNoEncontrado extends Error {
  readonly status = 404;
}

const state = {
  campaigns: [structuredClone(CAMPAIGN)] as Campaign[],
  icpTurns: structuredClone(ICP_TURNS) as IcpTurn[],
  accounts: structuredClone(ACCOUNTS),
  prospects: structuredClone(PROSPECTS) as Prospect[],
  events: structuredClone(EVENTS) as ProspectEvent[],
  inbox: structuredClone(INBOX) as InboxItem[],
  guardrails: structuredClone(GUARDRAILS),
  team: structuredClone(TEAM) as TenantUser[],
};

const now = (): string => new Date().toISOString();

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const [cleanPath] = path.split("?");
  const p = pattern.split("/");
  const s = (cleanPath ?? "").split("/");
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i += 1) {
    const pi = p[i] ?? "";
    const si = s[i] ?? "";
    if (pi.startsWith(":")) params[pi.slice(1)] = decodeURIComponent(si);
    else if (pi !== si) return null;
  }
  return params;
}

type Handler = (params: Record<string, string>, body: unknown, query: URLSearchParams) => unknown;

const routes: Array<[method: string, pattern: string, handler: Handler]> = [
  ["GET", "/dashboard/summary", () => DASHBOARD],

  ["GET", "/campaigns", () => state.campaigns],
  [
    "POST",
    "/campaigns",
    (_p, body) => {
      const input = CreateCampaignSchema.parse(body);
      const campaign: Campaign = {
        ...structuredClone(CAMPAIGN),
        id: nextMockId(),
        name: input.prompt.slice(0, 40),
        prompt: input.prompt,
        status: "draft",
        meetingsGoal: input.meetingsGoal,
        stats: { accountsFound: 0, accountsHighFit: 0, contactsVerified: 0, contacted: 0, replied: 0, meetings: 0 },
        createdAt: now(),
        updatedAt: now(),
      };
      state.campaigns.push(campaign);
      const turn: IcpTurn = { role: "jano", text: "Entendido. He estructurado el ICP; revísalo antes de que busque cuentas.", icp: campaign.icp, suggestions: [], at: now() };
      return { campaign, turn };
    },
  ],
  ["GET", "/campaigns/:id", (p) => state.campaigns.find((c) => c.id === p["id"]) ?? notFound()],
  ["GET", "/campaigns/:id/icp", () => state.icpTurns],
  [
    "POST",
    "/campaigns/:id/icp",
    (_p, body) => {
      const { text } = body as { text: string };
      state.icpTurns.push({ role: "user", text, suggestions: [], at: now() });
      const turn: IcpTurn = { role: "jano", text: `Aplicado: «${text}». Vuelvo a puntuar las cuentas con el ICP actualizado.`, suggestions: [], at: now() };
      state.icpTurns.push(turn);
      return turn;
    },
  ],
  [
    "PUT",
    "/campaigns/:id/status",
    (p, body) => {
      const campaign = state.campaigns.find((c) => c.id === p["id"]) ?? notFound();
      campaign.status = (body as Campaign).status;
      campaign.updatedAt = now();
      return campaign;
    },
  ],
  ["GET", "/campaigns/:id/flow", () => FLOW],
  ["GET", "/campaigns/:id/flow/:stage/events", () => STAGE_EVENTS],
  [
    "GET",
    "/campaigns/:id/accounts",
    (_p, _b, query) => {
      const status = query.get("status");
      return state.accounts.filter((a) => (status ? a.status === status : true)).sort((a, b) => b.fitScore - a.fitScore);
    },
  ],
  [
    "POST",
    "/campaigns/:id/accounts/approve",
    (_p, body) => {
      const { accountIds } = body as { accountIds: string[] };
      let approved = 0;
      for (const a of state.accounts) {
        if (accountIds.includes(a.id) && a.status === "found") {
          a.status = "enriching";
          approved += 1;
        }
      }
      return { approved };
    },
  ],
  [
    "POST",
    "/campaigns/:id/accounts/discard",
    (_p, body) => {
      const { accountIds } = body as { accountIds: string[] };
      let discarded = 0;
      for (const a of state.accounts) {
        if (accountIds.includes(a.id) && a.status !== "discarded") {
          a.status = "discarded";
          discarded += 1;
        }
      }
      return { discarded };
    },
  ],

  [
    "GET",
    "/prospects/:id",
    (p) => {
      const prospect = state.prospects.find((x) => x.id === p["id"]) ?? notFound();
      const account = state.accounts.find((a) => a.id === prospect.accountId) ?? notFound();
      const contact = CONTACTS.find((c) => c.id === prospect.contactId) ?? null;
      return { prospect, account, contact };
    },
  ],
  ["GET", "/prospects/:id/events", (p) => state.events.filter((e) => e.prospectId === p["id"])],
  [
    "POST",
    "/prospects/:id/stop",
    (p) => {
      const prospect = state.prospects.find((x) => x.id === p["id"]) ?? notFound();
      prospect.stage = "discarded";
      prospect.nextActionAt = null;
      if (prospect.sequence) {
        for (const s of prospect.sequence.steps) if (s.status === "planned" || s.status === "awaiting_approval") s.status = "cancelled";
      }
      const event = evento(prospect.id, "human", "stopped", "Secuencia detenida a mano");
      return { prospect, event };
    },
  ],
  [
    "POST",
    "/prospects/:id/steps/:stepId/approve",
    (p) => {
      const prospect = state.prospects.find((x) => x.id === p["id"]) ?? notFound();
      const step = prospect.sequence?.steps.find((s) => s.id === p["stepId"]) ?? notFound();
      step.status = "sent";
      const event = evento(prospect.id, "human", "approved", `Paso «${step.title}» aprobado y ejecutado`);
      return { prospect, event };
    },
  ],

  [
    "GET",
    "/inbox",
    (_p, _b, query) => {
      const intent = query.get("intent");
      const status = query.get("status");
      return state.inbox
        .filter((i) => (intent ? i.intent === intent : true))
        .filter((i) => (status ? i.draft?.status === status : true))
        .sort((a, b) => rank(a) - rank(b));
    },
  ],
  ["GET", "/inbox/:id", (p) => state.inbox.find((i) => i.id === p["id"]) ?? notFound()],
  [
    "POST",
    "/inbox/:id/approve",
    (p, body) => {
      const item = state.inbox.find((i) => i.id === p["id"]) ?? notFound();
      const edit = ApproveDraftSchema.parse(body ?? {});
      if (!item.draft) notFound();
      item.draft = { ...item.draft, body: edit.body ?? item.draft.body, subject: edit.subject ?? item.draft.subject, status: "sent" };
      evento(item.prospectId, "human", "approved", `Respuesta a ${item.contactName} aprobada y enviada`);
      return item;
    },
  ],
  [
    "POST",
    "/inbox/:id/discard",
    (p) => {
      const item = state.inbox.find((i) => i.id === p["id"]) ?? notFound();
      if (item.draft) item.draft = { ...item.draft, status: "discarded" };
      return item;
    },
  ],
  [
    "POST",
    "/inbox/:id/regenerate",
    (p, body) => {
      const item = state.inbox.find((i) => i.id === p["id"]) ?? notFound();
      const { tone } = RegenerateDraftSchema.parse(body);
      if (!item.draft) notFound();
      const prefix = { mas_breve: "Versión breve. ", mas_formal: "Versión formal. ", mas_cercano: "Versión cercana. ", otra_propuesta: "Otra propuesta. " }[tone];
      item.draft = { ...item.draft, body: `${prefix}${item.draft.body}`, status: "pending_approval" };
      return item;
    },
  ],

  ["GET", "/compliance/summary", () => COMPLIANCE],
  ["GET", "/compliance/audit", () => AUDIT],
  ["GET", "/compliance/guardrails", () => state.guardrails],
  [
    "PUT",
    "/compliance/guardrails",
    (_p, body) => {
      state.guardrails = GuardrailsSchema.parse(body);
      return state.guardrails;
    },
  ],
  ["GET", "/connections", () => CONNECTIONS],

  ["GET", "/tenant", () => TENANT],
  ["GET", "/tenant/users", () => state.team],
  [
    "POST",
    "/tenant/users",
    (_p, body) => {
      const input = InviteTenantUserSchema.parse(body);
      const user: TenantUser = {
        userId: nextMockId(),
        email: input.email,
        name: input.name ?? null,
        role: "member",
        status: "invited",
        invitedBy: "mock-owner",
        createdAt: now(),
      };
      state.team.push(user);
      return user;
    },
  ],
  ["POST", "/tenant/users/:id/disable", (p) => cambiarMiembro(p["id"], "disabled")],
  ["POST", "/tenant/users/:id/enable", (p) => cambiarMiembro(p["id"], "active")],
  ["POST", "/tenant/users/:id/resend-invitation", (p) => state.team.find((u) => u.userId === p["id"]) ?? notFound()],
];

function cambiarMiembro(id: string | undefined, status: TenantUser["status"]): TenantUser {
  const u = state.team.find((x) => x.userId === id) ?? notFound();
  u.status = status;
  return u;
}

function rank(i: InboxItem): number {
  if (i.draft?.status === "pending_approval") return 0;
  if (i.intent === "opt_out") return 1;
  return 2;
}

function notFound(): never {
  throw new DemoNoEncontrado("No existe (mock)");
}

function evento(prospectId: string, agent: ProspectEvent["agent"], type: ProspectEvent["type"], summary: string): ProspectEvent {
  const e: ProspectEvent = { id: nextMockId(), prospectId, at: now(), agent, type, summary, reasoning: null, evidence: [], rulesChecked: [], message: null, stepId: null };
  state.events.push(e);
  return e;
}

/**
 * Los datos de ejemplo están escritos como si «ahora» fuera el 28 de octubre a las
 * 10:47 UTC. Al responder se trasladan a la hora real: lo pasado queda igual de
 * reciente (el último evento, hace un minuto) y las reuniones futuras se mueven por
 * días enteros, sin perder su hora redonda. Así ninguna pantalla dice «hace 2 d»
 * junto a un registro de hoy.
 */
const ANCLA = Date.parse("2026-10-28T10:47:00.000Z");
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DIA = 86_400_000;

function aHoy<T>(valor: T, ahora = Date.now()): T {
  const desfase = ahora - ANCLA;
  const dias = Math.round(desfase / DIA) * DIA;
  const mover = (v: unknown): unknown => {
    if (typeof v === "string" && ISO.test(v)) {
      const t = Date.parse(v);
      if (t <= ANCLA) return new Date(t + desfase).toISOString();
      // Solo las fechas futuras de los datos (horas en punto o y media); lo creado en la sesión no se toca.
      if (/T\d{2}:(00|30):00\.000Z$/.test(v)) return new Date(t + dias).toISOString();
      return v;
    }
    if (Array.isArray(v)) return v.map(mover);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mover(x)]));
    return v;
  };
  return mover(valor) as T;
}

export async function resolverDemo<T>(method: string, path: string, body?: unknown, latenciaMs = 120): Promise<T> {
  const [cleanPath = "", qs = ""] = path.split("?");
  const query = new URLSearchParams(qs);
  for (const [m, pattern, handler] of routes) {
    if (m !== method) continue;
    const params = matchPath(pattern, cleanPath);
    if (!params) continue;
    if (latenciaMs > 0) await new Promise((r) => setTimeout(r, latenciaMs));
    return aHoy(structuredClone(handler(params, body, query))) as T;
  }
  throw new DemoNoEncontrado(`Sin mock para ${method} ${cleanPath}`);
}

export { IDS };
