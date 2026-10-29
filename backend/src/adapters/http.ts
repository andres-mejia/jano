import {
  AccountSchema,
  AccountSelectionSchema,
  AccountStatusSchema,
  ApproveDraftSchema,
  AuditEntrySchema,
  CampaignSchema,
  CampaignStatusSchema,
  CandidateJobSchema,
  CandidateRequestSchema,
  ComplianceSummarySchema,
  ConnectionSchema,
  CreateCampaignSchema,
  DashboardSummarySchema,
  DraftStatusSchema,
  FlowMapSchema,
  GuardrailsSchema,
  IcpTurnSchema,
  InboxItemSchema,
  InviteTenantUserSchema,
  OpportunitySchema,
  ProspectActionResultSchema,
  ProspectDetailSchema,
  ProspectEventSchema,
  ProspectStageSchema,
  RegenerateDraftSchema,
  ReplyIntentSchema,
} from "@jano/domain";
import { z } from "zod";

import { cargarActor, type Sesion } from "../application/acceso";
import { aprobarBorrador, descartarBorrador, elementoBandeja, listarBandeja, regenerarBorrador } from "../application/bandeja";
import { afinarIcp, cambiarEstadoCampana, cargarCampana, crearCampana, turnosIcp } from "../application/campanas";
import { conTenant } from "../application/contexto-tenant";
import { aprobarCuentas, descartarCuentas, encolarCandidatas, listarCuentas } from "../application/cuentas";
import { desactivar, invitar, listarEquipo, reactivar, reenviarInvitacion } from "../application/equipo";
import { aprobarPaso, detalleProspect, detenerProspect, eventosProspect } from "../application/prospects";
import { darDeBaja } from "../application/respuestas";
import type { Servicios } from "../application/servicios";
import { tenantActual } from "../application/tenant-actual";
import {
  auditoria,
  cambiarGuardarrailes,
  centroDeMando,
  conexiones,
  eventosDeEtapa,
  mapaDeFlujo,
  oportunidades,
  oportunidadesCsv,
  resumenCumplimiento,
} from "../application/vistas";
import type { Actor } from "../domain/equipo";
import { ErrorDeNegocio, invalido, noEncontrado, type TipoDeError } from "../domain/errores";
import type { Db, UnidadDeTrabajo } from "../ports/db";
import type { Directorio } from "../ports/directorio";

/** Lo que usamos del evento de API Gateway HTTP API (payload 2.0). */
export interface EventoHttp {
  readonly routeKey: string;
  readonly rawPath?: string;
  readonly rawQueryString?: string;
  readonly pathParameters?: Readonly<Record<string, string | undefined>>;
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly requestContext: {
    readonly requestId: string;
    readonly authorizer?: { readonly jwt?: { readonly claims?: Readonly<Record<string, unknown>> } };
  };
}

export interface RespuestaHttp {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

interface Contexto {
  readonly uow: UnidadDeTrabajo;
  readonly actor: Actor;
  readonly evento: EventoHttp;
}

/** Respuesta de una ruta. Por defecto JSON; `texto` para CSV y HTML. */
interface Salida {
  readonly status: number;
  readonly body: unknown;
  readonly texto?: { readonly tipo: string; readonly cabeceras?: Record<string, string> };
}

type Ruta = (ctx: Contexto, deps: Dependencias) => Promise<Salida>;

export interface Dependencias {
  readonly db: Db;
  readonly directorio: Directorio;
  /** Agentes, correo, web, reloj y configuración del motor (spec 008). */
  readonly servicios: Servicios;
  /**
   * Datos de ejemplo para las rutas del contrato que el backend aún no sirve
   * (spec 003). Solo en dev y para demos; sin esto, esas rutas dan 404.
   */
  readonly demo?: (method: string, path: string, body: unknown) => Promise<unknown>;
  /**
   * Tenants que siguen viendo los datos de ejemplo en todo el contrato salvo equipo
   * (`/tenant`), aunque exista la ruta real: la demo comercial no se rompe mientras la
   * prueba de concepto corre en otro tenant. Requiere `demo`.
   */
  readonly tenantsDemo?: ReadonlySet<string>;
}

const ESTADO: Record<TipoDeError, number> = { prohibido: 403, no_encontrado: 404, conflicto: 409, invalido: 400, no_disponible: 503 };

const json = (statusCode: number, body: unknown, problema = statusCode >= 400): RespuestaHttp => ({
  statusCode,
  headers: { "content-type": problema ? "application/problem+json" : "application/json" },
  body: JSON.stringify(body),
});

const userId = (e: EventoHttp): string => {
  const id = e.pathParameters?.["userId"];
  if (!id) throw invalido("Falta el usuario.");
  return id;
};

/** Un id de la ruta que no es un uuid no existe: 404, no 500. */
const id = (e: EventoHttp, nombre: string): string => {
  const v = e.pathParameters?.[nombre];
  if (!v || !z.string().uuid().safeParse(v).success) throw noEncontrado();
  return v;
};

function cuerpo(e: EventoHttp): unknown {
  if (!e.body) return {};
  const texto = e.isBase64Encoded ? Buffer.from(e.body, "base64").toString("utf8") : e.body;
  try {
    return JSON.parse(texto);
  } catch {
    throw invalido("El cuerpo de la petición no es JSON válido.");
  }
}

function leer<T extends z.ZodTypeAny>(schema: T, e: EventoHttp, mensaje = "Revisa los datos enviados."): z.infer<T> {
  const r = schema.safeParse(cuerpo(e));
  if (!r.success) throw invalido(mensaje);
  return r.data;
}

const query = (e: EventoHttp) => new URLSearchParams(e.rawQueryString ?? "");

function filtro<T extends z.ZodTypeAny>(schema: T, valor: string | null): z.infer<T> | null {
  if (valor === null) return null;
  const r = schema.safeParse(valor);
  if (!r.success) throw invalido("Filtro no válido.");
  return r.data;
}

const limite = (e: EventoHttp): number => {
  const r = z.coerce.number().int().min(1).max(200).safeParse(query(e).get("limit") ?? "50");
  if (!r.success) throw invalido("El límite va de 1 a 200.");
  return r.data;
};

/**
 * Lo que sale se valida con el mismo esquema que consume la app: un fallo aquí es
 * un bug del backend (500), nunca una respuesta fuera de contrato.
 */
const ok = <T extends z.ZodTypeAny>(schema: T, body: unknown, status = 200): Salida => ({ status, body: schema.parse(body) });

/** Rutas de contracts/openapi/jano-api.yaml, con el prefijo `/v1`. */
export const RUTAS: Readonly<Record<string, Ruta>> = {
  // ── Equipo (spec 007) ──
  "GET /v1/tenant": async ({ uow, actor }) => ({ status: 200, body: await tenantActual(uow, actor) }),
  "GET /v1/tenant/users": async ({ uow, actor }) => ({ status: 200, body: await listarEquipo(uow, actor) }),
  "POST /v1/tenant/users": async ({ uow, actor, evento }, { directorio }) => {
    const datos = leer(InviteTenantUserSchema, evento, "Revisa el email de la persona que quieres invitar.");
    return { status: 201, body: await invitar(uow, directorio, actor, datos) };
  },
  "POST /v1/tenant/users/{userId}/disable": async ({ uow, actor, evento }, { directorio }) => ({
    status: 200,
    body: await desactivar(uow, directorio, actor, userId(evento)),
  }),
  "POST /v1/tenant/users/{userId}/enable": async ({ uow, actor, evento }, { directorio }) => ({
    status: 200,
    body: await reactivar(uow, directorio, actor, userId(evento)),
  }),
  "POST /v1/tenant/users/{userId}/resend-invitation": async ({ uow, actor, evento }, { directorio }) => ({
    status: 200,
    body: await reenviarInvitacion(uow, directorio, actor, userId(evento)),
  }),

  // ── Centro de mando y campañas (spec 008) ──
  "GET /v1/dashboard/summary": async ({ uow }, { servicios }) => ok(DashboardSummarySchema, await centroDeMando(uow, servicios)),
  "GET /v1/campaigns": async ({ uow }) => ok(z.array(CampaignSchema), await uow.campanas.listar()),
  "POST /v1/campaigns": async ({ uow, evento }, { servicios }) =>
    ok(z.object({ campaign: CampaignSchema, turn: IcpTurnSchema }), await crearCampana(uow, servicios, leer(CreateCampaignSchema, evento)), 201),
  "GET /v1/campaigns/{campaignId}": async ({ uow, evento }) => ok(CampaignSchema, await cargarCampana(uow, id(evento, "campaignId"))),
  "GET /v1/campaigns/{campaignId}/icp": async ({ uow, evento }) => ok(z.array(IcpTurnSchema), await turnosIcp(uow, id(evento, "campaignId"))),
  "POST /v1/campaigns/{campaignId}/icp": async ({ uow, evento }, { servicios }) => {
    const { text } = leer(z.object({ text: z.string().trim().min(2).max(500) }), evento);
    return ok(IcpTurnSchema, await afinarIcp(uow, servicios, id(evento, "campaignId"), text));
  },
  "PUT /v1/campaigns/{campaignId}/status": async ({ uow, evento }) => {
    const { status } = leer(z.object({ status: CampaignStatusSchema }), evento);
    return ok(CampaignSchema, await cambiarEstadoCampana(uow, id(evento, "campaignId"), status));
  },
  "GET /v1/campaigns/{campaignId}/flow": async ({ uow, evento }) => ok(FlowMapSchema, await mapaDeFlujo(uow, id(evento, "campaignId"))),
  "GET /v1/campaigns/{campaignId}/flow/{stage}/events": async ({ uow, evento }) => {
    const stage = ProspectStageSchema.safeParse(evento.pathParameters?.["stage"]);
    if (!stage.success) throw noEncontrado();
    return ok(z.array(ProspectEventSchema), await eventosDeEtapa(uow, id(evento, "campaignId"), stage.data, limite(evento)));
  },

  // ── Cuentas ──
  "GET /v1/campaigns/{campaignId}/accounts": async ({ uow, evento }) => {
    const status = filtro(AccountStatusSchema, query(evento).get("status"));
    return ok(z.array(AccountSchema), await listarCuentas(uow, id(evento, "campaignId"), { status, limite: limite(evento) }));
  },
  "POST /v1/campaigns/{campaignId}/accounts/candidates": async ({ uow, actor, evento }, { servicios }) => {
    const peticion = leer(CandidateRequestSchema, evento, "Indica una región o entre 1 y 25 dominios válidos.");
    return ok(CandidateJobSchema, await encolarCandidatas(uow, servicios, actor.tenantId, id(evento, "campaignId"), peticion), 202);
  },
  "POST /v1/campaigns/{campaignId}/accounts/approve": async ({ uow, evento }, { servicios }) => {
    const { accountIds } = leer(AccountSelectionSchema, evento);
    return ok(z.object({ approved: z.number().int() }), await aprobarCuentas(uow, servicios, id(evento, "campaignId"), accountIds), 202);
  },
  "POST /v1/campaigns/{campaignId}/accounts/discard": async ({ uow, evento }) => {
    const { accountIds } = leer(AccountSelectionSchema, evento);
    return ok(z.object({ discarded: z.number().int() }), await descartarCuentas(uow, id(evento, "campaignId"), accountIds));
  },

  // ── Prospects ──
  "GET /v1/prospects/{prospectId}": async ({ uow, evento }) => ok(ProspectDetailSchema, await detalleProspect(uow, id(evento, "prospectId"))),
  "GET /v1/prospects/{prospectId}/events": async ({ uow, evento }) => ok(z.array(ProspectEventSchema), await eventosProspect(uow, id(evento, "prospectId"))),
  "POST /v1/prospects/{prospectId}/stop": async ({ uow, actor, evento }) => {
    const r = await detenerProspect(uow, actor, id(evento, "prospectId"));
    return ok(ProspectActionResultSchema, { prospect: r.prospect, event: r.event }, r.ok ? 200 : 409);
  },
  "POST /v1/prospects/{prospectId}/steps/{stepId}/approve": async ({ uow, actor, evento }, { servicios }) => {
    const r = await aprobarPaso(uow, servicios, actor, id(evento, "prospectId"), id(evento, "stepId"));
    return ok(ProspectActionResultSchema, { prospect: r.prospect, event: r.event }, r.ok ? 200 : 409);
  },

  // ── Bandeja ──
  "GET /v1/inbox": async ({ uow, evento }) => {
    const q = query(evento);
    return ok(z.array(InboxItemSchema), await listarBandeja(uow, { intent: filtro(ReplyIntentSchema, q.get("intent")), status: filtro(DraftStatusSchema, q.get("status")) }));
  },
  "GET /v1/inbox/{itemId}": async ({ uow, evento }) => ok(InboxItemSchema, await elementoBandeja(uow, id(evento, "itemId"))),
  "POST /v1/inbox/{itemId}/approve": async ({ uow, actor, evento }, { servicios }) => {
    const r = await aprobarBorrador(uow, servicios, actor, id(evento, "itemId"), leer(ApproveDraftSchema, evento));
    // El evento que explica el bloqueo se confirma: por eso no se lanza.
    return r.ok ? ok(InboxItemSchema, r.item) : { status: 409, body: { title: r.motivo, status: 409, detail: r.motivo } };
  },
  "POST /v1/inbox/{itemId}/discard": async ({ uow, actor, evento }) => ok(InboxItemSchema, await descartarBorrador(uow, actor, id(evento, "itemId"))),
  "POST /v1/inbox/{itemId}/regenerate": async ({ uow, evento }, { servicios }) =>
    ok(InboxItemSchema, await regenerarBorrador(uow, servicios, id(evento, "itemId"), leer(RegenerateDraftSchema, evento))),

  // ── Cumplimiento, conexiones y oportunidades ──
  "GET /v1/compliance/summary": async ({ uow }, { servicios }) => ok(ComplianceSummarySchema, await resumenCumplimiento(uow, servicios)),
  "GET /v1/compliance/audit": async ({ uow, evento }) => ok(z.array(AuditEntrySchema), await auditoria(uow, limite(evento))),
  "GET /v1/compliance/guardrails": async ({ uow }) => ok(GuardrailsSchema, await uow.cumplimiento.guardarrailes()),
  "PUT /v1/compliance/guardrails": async ({ uow, actor, evento }) =>
    ok(GuardrailsSchema, await cambiarGuardarrailes(uow, actor, leer(GuardrailsSchema, evento))),
  "GET /v1/connections": async (_ctx, { servicios }) => ok(z.array(ConnectionSchema), conexiones(servicios)),
  "GET /v1/opportunities": async ({ uow }) => ok(z.array(OpportunitySchema), await oportunidades(uow)),
  "GET /v1/opportunities/export": async ({ uow }) => ({
    status: 200,
    body: oportunidadesCsv(await oportunidades(uow)),
    texto: { tipo: "text/csv; charset=utf-8", cabeceras: { "content-disposition": 'attachment; filename="oportunidades.csv"' } },
  }),
};

/** Página de la baja: la misma exista o no el token, para no revelar nada. */
const PAGINA_BAJA = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Baja confirmada</title></head>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>Baja confirmada</h1><p>No volverás a recibir correos de esta empresa enviados con Jano.</p></body></html>`;

/** Rutas públicas, sin JWT: solo la baja (FR-022). Cada una resuelve su tenant por el token. */
export const RUTAS_PUBLICAS: Readonly<Record<string, (evento: EventoHttp, deps: Dependencias) => Promise<RespuestaHttp>>> = {
  "GET /v1/baja/{token}": async (evento, { db }) => {
    const token = evento.pathParameters?.["token"] ?? "";
    const destino = await db.resolverToken(token);
    if (destino) await conTenant(destino.tenantId, () => db.enTenant(destino.tenantId, (uow) => darDeBaja(uow, destino.prospectId)));
    console.log(JSON.stringify({ msg: "baja", request_id: evento.requestContext.requestId, tenant_id: destino?.tenantId ?? null, prospect_id: destino?.prospectId ?? null }));
    return { statusCode: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }, body: PAGINA_BAJA };
  },
};

/**
 * Ruta de demo: el resto del contrato, resuelto con `@jano/demo`. Pasa por la
 * misma sesión y comprobación de acceso que las rutas reales.
 */
function rutaDemo(evento: EventoHttp, deps: Dependencias): Ruta | null {
  const demo = deps.demo;
  const [metodo] = evento.routeKey.split(" ");
  if (!demo || !metodo || !evento.rawPath?.startsWith("/v1/")) return null;
  const path = evento.rawPath.slice(3) + (evento.rawQueryString ? `?${evento.rawQueryString}` : "");
  return async ({ evento: e }) => {
    try {
      const body = await demo(metodo, path, metodo === "GET" ? undefined : cuerpo(e));
      return { status: metodo === "POST" && path === "/campaigns" ? 201 : 200, body };
    } catch (err) {
      if ((err as { status?: unknown }).status === 404) throw noEncontrado();
      if ((err as { name?: unknown }).name === "ZodError") throw invalido("Revisa los datos enviados.");
      throw err;
    }
  };
}

function sesionDe(e: EventoHttp): Sesion | null {
  const claims = e.requestContext.authorizer?.jwt?.claims ?? {};
  const sub = claims["sub"];
  const tenant = claims["custom:tenant_id"];
  return typeof sub === "string" && sub && typeof tenant === "string" && tenant ? { userId: sub, tenantId: tenant } : null;
}

/**
 * Cada petición: sesión del JWT (validado por API Gateway), una transacción con el
 * tenant del token, comprobación de acceso (FR-006) y el caso de uso. Un error de
 * negocio deshace la transacción y se devuelve como `Problem`; cualquier otro, 500
 * sin detalles. Lo que el motor rechaza sin lanzar (409 con su evento) sí se confirma.
 */
export function crearManejador(deps: Dependencias) {
  return async (evento: EventoHttp): Promise<RespuestaHttp> => {
    const publica = RUTAS_PUBLICAS[evento.routeKey];
    if (publica) {
      try {
        return await publica(evento, deps);
      } catch (e) {
        console.log(JSON.stringify({ msg: "error", ruta: evento.routeKey, request_id: evento.requestContext.requestId, error: e instanceof Error ? e.message : String(e) }));
        return json(500, { title: "Error interno", status: 500 });
      }
    }

    const sesion = sesionDe(evento);
    const deEjemplo = !!sesion && !!deps.tenantsDemo?.has(sesion.tenantId) && !evento.rawPath?.startsWith("/v1/tenant");
    const ruta = (deEjemplo ? rutaDemo(evento, deps) : null) ?? RUTAS[evento.routeKey] ?? rutaDemo(evento, deps);
    if (!ruta) return json(404, { title: "No encontrado", status: 404 });
    if (!sesion) return json(401, { title: "Sin sesión", status: 401 });

    const log = (msg: string, extra: Record<string, unknown> = {}) =>
      console.log(
        JSON.stringify({ msg, ruta: evento.routeKey, tenant_id: sesion.tenantId, request_id: evento.requestContext.requestId, ...extra }),
      );

    try {
      // El tenant en curso, para cargar al tenant las llamadas al modelo (FR-016).
      const r = await conTenant(sesion.tenantId, () =>
        deps.db.enTenant(sesion.tenantId, async (uow) => {
          const actor = await cargarActor(uow, sesion);
          return ruta({ uow, actor, evento }, deps);
        }),
      );
      log("ok", { status: r.status, ...prospectDe(evento) });
      if (r.texto) return { statusCode: r.status, headers: { "content-type": r.texto.tipo, ...r.texto.cabeceras }, body: String(r.body) };
      const problema = r.status >= 400 && typeof r.body === "object" && r.body !== null && "title" in r.body;
      return json(r.status, r.body, problema);
    } catch (e) {
      if (e instanceof ErrorDeNegocio) {
        const status = ESTADO[e.tipo];
        log("rechazada", { status, tipo: e.tipo });
        return json(status, { title: e.message, status, detail: e.message });
      }
      log("error", { error: e instanceof Error ? e.message : String(e) });
      return json(500, { title: "Error interno", status: 500 });
    }
  };
}

const prospectDe = (e: EventoHttp) => (e.pathParameters?.["prospectId"] ? { prospect_id: e.pathParameters["prospectId"] } : {});
