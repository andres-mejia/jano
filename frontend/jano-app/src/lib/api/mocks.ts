/**
 * Resolución de la API en modo mock. Mantiene estado en memoria para que las
 * acciones (aprobar, descartar, detener) se reflejen en la sesión. Las rutas
 * replican `contracts/openapi/jano-api.yaml`; una ruta que no está aquí falla
 * con 404 para que el hueco se vea.
 */

import type { Campaign, IcpTurn, InboxItem, Prospect, ProspectEvent } from "@jano/domain";
import { ApproveDraftSchema, CreateCampaignSchema, GuardrailsSchema, RegenerateDraftSchema } from "@jano/domain";

import { ACCOUNTS, CAMPAIGN, CONTACTS, ICP_TURNS } from "./fixtures/campaign";
import { IDS, nextMockId } from "./fixtures/ids";
import { INBOX } from "./fixtures/inbox";
import { EVENTS, PROSPECTS, STAGE_EVENTS } from "./fixtures/prospects";
import { AUDIT, COMPLIANCE, CONNECTIONS, DASHBOARD, FLOW, GUARDRAILS } from "./fixtures/views";

class MockNotFound extends Error {
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
];

function rank(i: InboxItem): number {
  if (i.draft?.status === "pending_approval") return 0;
  if (i.intent === "opt_out") return 1;
  return 2;
}

function notFound(): never {
  throw new MockNotFound("No existe (mock)");
}

function evento(prospectId: string, agent: ProspectEvent["agent"], type: ProspectEvent["type"], summary: string): ProspectEvent {
  const e: ProspectEvent = { id: nextMockId(), prospectId, at: now(), agent, type, summary, reasoning: null, evidence: [], rulesChecked: [], message: null, stepId: null };
  state.events.push(e);
  return e;
}

export async function resolveMock<T>(method: string, path: string, body?: unknown): Promise<T> {
  const [cleanPath = "", qs = ""] = path.split("?");
  const query = new URLSearchParams(qs);
  for (const [m, pattern, handler] of routes) {
    if (m !== method) continue;
    const params = matchPath(pattern, cleanPath);
    if (!params) continue;
    await new Promise((r) => setTimeout(r, 120));
    return structuredClone(handler(params, body, query)) as T;
  }
  throw new MockNotFound(`Sin mock para ${method} ${cleanPath}`);
}

export const MOCK_IDS = IDS;
