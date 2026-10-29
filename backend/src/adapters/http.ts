import { InviteTenantUserSchema } from "@jano/domain";

import { cargarActor, type Sesion } from "../application/acceso";
import { desactivar, invitar, listarEquipo, reactivar, reenviarInvitacion } from "../application/equipo";
import { tenantActual } from "../application/tenant-actual";
import type { Actor } from "../domain/equipo";
import { ErrorDeNegocio, invalido, type TipoDeError } from "../domain/errores";
import type { Db, UnidadDeTrabajo } from "../ports/db";
import type { Directorio } from "../ports/directorio";

/** Lo que usamos del evento de API Gateway HTTP API (payload 2.0). */
export interface EventoHttp {
  readonly routeKey: string;
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

type Ruta = (ctx: Contexto, deps: Dependencias) => Promise<{ status: number; body: unknown }>;

export interface Dependencias {
  readonly db: Db;
  readonly directorio: Directorio;
}

const ESTADO: Record<TipoDeError, number> = { prohibido: 403, no_encontrado: 404, conflicto: 409, invalido: 400 };

const json = (statusCode: number, body: unknown): RespuestaHttp => ({
  statusCode,
  headers: { "content-type": statusCode >= 400 ? "application/problem+json" : "application/json" },
  body: JSON.stringify(body),
});

const userId = (e: EventoHttp): string => {
  const id = e.pathParameters?.["userId"];
  if (!id) throw invalido("Falta el usuario.");
  return id;
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

const ok = (body: unknown) => ({ status: 200, body });

/** Rutas de contracts/openapi/jano-api.yaml (tag `team`), con el prefijo `/v1`. */
export const RUTAS: Readonly<Record<string, Ruta>> = {
  "GET /v1/tenant": async ({ uow, actor }) => ok(await tenantActual(uow, actor)),
  "GET /v1/tenant/users": async ({ uow, actor }) => ok(await listarEquipo(uow, actor)),
  "POST /v1/tenant/users": async ({ uow, actor, evento }, { directorio }) => {
    const datos = InviteTenantUserSchema.safeParse(cuerpo(evento));
    if (!datos.success) throw invalido("Revisa el email de la persona que quieres invitar.");
    return { status: 201, body: await invitar(uow, directorio, actor, datos.data) };
  },
  "POST /v1/tenant/users/{userId}/disable": async ({ uow, actor, evento }, { directorio }) =>
    ok(await desactivar(uow, directorio, actor, userId(evento))),
  "POST /v1/tenant/users/{userId}/enable": async ({ uow, actor, evento }, { directorio }) =>
    ok(await reactivar(uow, directorio, actor, userId(evento))),
  "POST /v1/tenant/users/{userId}/resend-invitation": async ({ uow, actor, evento }, { directorio }) =>
    ok(await reenviarInvitacion(uow, directorio, actor, userId(evento))),
};

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
 * sin detalles.
 */
export function crearManejador(deps: Dependencias) {
  return async (evento: EventoHttp): Promise<RespuestaHttp> => {
    const ruta = RUTAS[evento.routeKey];
    if (!ruta) return json(404, { title: "No encontrado", status: 404 });

    const sesion = sesionDe(evento);
    if (!sesion) return json(401, { title: "Sin sesión", status: 401 });

    const log = (msg: string, extra: Record<string, unknown> = {}) =>
      console.log(
        JSON.stringify({ msg, ruta: evento.routeKey, tenant_id: sesion.tenantId, request_id: evento.requestContext.requestId, ...extra }),
      );

    try {
      const r = await deps.db.enTenant(sesion.tenantId, async (uow) => {
        const actor = await cargarActor(uow, sesion);
        return ruta({ uow, actor, evento }, deps);
      });
      log("ok", { status: r.status });
      return json(r.status, r.body);
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
