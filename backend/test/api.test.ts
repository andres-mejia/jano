import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { crearManejador, type EventoHttp } from "../src/adapters/http";
import { serviciosDePrueba } from "./servicios-prueba";
import { DirectorioEnMemoria } from "./directorio-memoria";
import { type BaseDePruebas, baseDePruebas } from "./pg";
import { A, B, sembrarTenant } from "./semilla";

/** Casos de uso a través de la API (US1-US4), con la base de datos real y Cognito en memoria. */
let base: BaseDePruebas;
let directorio: DirectorioEnMemoria;
let manejar: ReturnType<typeof crearManejador>;
let ids: Record<string, string>;
let idsB: Record<string, string>;

before(async () => {
  base = await baseDePruebas();
  ids = await sembrarTenant(base.admin, A, [
    { email: "alba@faro.example", role: "member", status: "active" },
    { email: "olga@faro.example", role: "owner", status: "active" },
  ]);
  idsB = await sembrarTenant(base.admin, B, [{ email: "berta@brisa.example", role: "member", status: "active" }]);
});
after(() => base.cerrar());
beforeEach(() => {
  directorio = new DirectorioEnMemoria();
  for (const [email, userId] of Object.entries({ ...ids, ...idsB })) {
    directorio.usuarios.set(email, {
      email,
      userId,
      name: null,
      role: email.startsWith("ana") || email.startsWith("olga") || email.startsWith("bruno") ? "owner" : "member",
      tenantId: email.endsWith("faro.example") ? A.id : B.id,
      confirmado: true,
      habilitado: true,
    });
  }
  manejar = crearManejador({ db: base.db, directorio, servicios: serviciosDePrueba().servicios });
});

const pedir = async (quien: string, tenant: string, routeKey: string, extra: Partial<EventoHttp> = {}) => {
  const r = await manejar({
    routeKey,
    requestContext: { requestId: "r1", authorizer: { jwt: { claims: { sub: quien, "custom:tenant_id": tenant } } } },
    ...extra,
  });
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, unknown> & unknown[] };
};
const ana = () => ids["ana@faro.example"] ?? "";
const alba = () => ids["alba@faro.example"] ?? "";

test("GET /tenant devuelve la empresa y el rol del usuario", async () => {
  const r = await pedir(ana(), A.id, "GET /v1/tenant");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { id: A.id, name: A.name, plan: "piloto", status: "active", role: "owner" });
  assert.equal((await pedir(alba(), A.id, "GET /v1/tenant")).body["role"], "member");
});

test("sin claims de sesión: 401; ruta desconocida: 404", async () => {
  const r = await manejar({ routeKey: "GET /v1/tenant", requestContext: { requestId: "r" } });
  assert.equal(r.statusCode, 401);
  assert.equal((await pedir(ana(), A.id, "GET /v1/nada")).status, 404);
});

test("un token con el tenant de otro (usuario que no es de ese tenant) no entra", async () => {
  assert.equal((await pedir(ana(), B.id, "GET /v1/tenant")).status, 403);
});

test("el owner lista su equipo, owners primero; un member no puede", async () => {
  const r = await pedir(ana(), A.id, "GET /v1/tenant/users");
  assert.equal(r.status, 200);
  assert.deepEqual(
    (r.body as unknown as { email: string }[]).map((u) => u.email),
    ["ana@faro.example", "olga@faro.example", "alba@faro.example"],
  );
  assert.equal((await pedir(alba(), A.id, "GET /v1/tenant/users")).status, 403);
});

test("invitar crea el usuario en Cognito y en la base de datos, en minúsculas y como member", async () => {
  const r = await pedir(ana(), A.id, "POST /v1/tenant/users", { body: JSON.stringify({ email: "Carla@Faro.example", name: "Carla" }) });
  assert.equal(r.status, 201);
  assert.equal(r.body["email"], "carla@faro.example");
  assert.equal(r.body["role"], "member");
  assert.equal(r.body["status"], "invited");
  assert.equal(r.body["invitedBy"], ana());
  assert.equal(directorio.usuarios.get("carla@faro.example")?.tenantId, A.id);

  const act = await base.admin.enTenantSql(A.id, (tx) =>
    tx.query<{ action: string }>("select action from user_activity where target = :t", { t: String(r.body["userId"]) }),
  );
  assert.deepEqual(act.map((a) => a.action), ["user_invited"]);
});

test("el invitado pasa de invited a active en su primera petición", async () => {
  const r = await pedir(ana(), A.id, "POST /v1/tenant/users", { body: JSON.stringify({ email: "dani@faro.example" }) });
  const dani = String(r.body["userId"]);
  assert.equal((await pedir(dani, A.id, "GET /v1/tenant")).status, 200);
  const lista = (await pedir(ana(), A.id, "GET /v1/tenant/users")).body as unknown as { userId: string; status: string }[];
  assert.equal(lista.find((u) => u.userId === dani)?.status, "active");
});

test("invitar un email que ya existe en otro tenant: 409 sin revelar el tenant ni dejar rastro", async () => {
  const r = await pedir(ana(), A.id, "POST /v1/tenant/users", { body: JSON.stringify({ email: "berta@brisa.example" }) });
  assert.equal(r.status, 409);
  assert.doesNotMatch(JSON.stringify(r.body), /brisa|Brisa/i);
});

test("si la base de datos rechaza el alta, se deshace en Cognito", async () => {
  // Existe en la base de datos (otro tenant) pero no en Cognito: Cognito lo crea y la BD lo rechaza.
  directorio.usuarios.delete("berta@brisa.example");
  const r = await pedir(ana(), A.id, "POST /v1/tenant/users", { body: JSON.stringify({ email: "berta@brisa.example" }) });
  assert.equal(r.status, 409);
  assert.equal(directorio.usuarios.has("berta@brisa.example"), false);
});

test("un member no puede invitar y un email inválido es 400", async () => {
  assert.equal((await pedir(alba(), A.id, "POST /v1/tenant/users", { body: JSON.stringify({ email: "e@faro.example" }) })).status, 403);
  assert.equal((await pedir(ana(), A.id, "POST /v1/tenant/users", { body: JSON.stringify({ email: "no-es-email" }) })).status, 400);
  assert.equal((await pedir(ana(), A.id, "POST /v1/tenant/users", { body: "{" })).status, 400);
});

test("desactivar a un member corta su acceso en la siguiente petición; reactivar lo devuelve", async () => {
  const r = await pedir(ana(), A.id, "POST /v1/tenant/users/{userId}/disable", { pathParameters: { userId: alba() } });
  assert.equal(r.status, 200);
  assert.equal(r.body["status"], "disabled");
  assert.equal(directorio.usuarios.get("alba@faro.example")?.habilitado, false);
  assert.equal((await pedir(alba(), A.id, "GET /v1/tenant")).status, 403);

  const e = await pedir(ana(), A.id, "POST /v1/tenant/users/{userId}/enable", { pathParameters: { userId: alba() } });
  assert.equal(e.body["status"], "active");
  assert.equal((await pedir(alba(), A.id, "GET /v1/tenant")).status, 200);
});

test("no se desactiva a uno mismo ni a otro owner", async () => {
  assert.equal((await pedir(ana(), A.id, "POST /v1/tenant/users/{userId}/disable", { pathParameters: { userId: ana() } })).status, 409);
  const olga = ids["olga@faro.example"] ?? "";
  assert.equal((await pedir(ana(), A.id, "POST /v1/tenant/users/{userId}/disable", { pathParameters: { userId: olga } })).status, 409);
});

test("reenviar solo a quien sigue invitado", async () => {
  const r = await pedir(ana(), A.id, "POST /v1/tenant/users", { body: JSON.stringify({ email: "eva@faro.example" }) });
  const eva = String(r.body["userId"]);
  assert.equal((await pedir(ana(), A.id, "POST /v1/tenant/users/{userId}/resend-invitation", { pathParameters: { userId: eva } })).status, 200);
  assert.deepEqual(directorio.reenvios, ["eva@faro.example"]);
  assert.equal(
    (await pedir(ana(), A.id, "POST /v1/tenant/users/{userId}/resend-invitation", { pathParameters: { userId: alba() } })).status,
    409,
  );
});

test("un owner de A no gestiona usuarios de B aunque conozca su id (US4)", async () => {
  const berta = idsB["berta@brisa.example"] ?? "";
  for (const accion of ["disable", "enable", "resend-invitation"]) {
    const r = await pedir(ana(), A.id, `POST /v1/tenant/users/{userId}/${accion}`, { pathParameters: { userId: berta } });
    assert.equal(r.status, 404, accion);
  }
  assert.equal(directorio.usuarios.get("berta@brisa.example")?.habilitado, true);
});

test("un tenant suspendido no entra (US5)", async () => {
  await base.admin.enTenant(B.id, ({ equipo }) => equipo.cambiarEstadoTenant("suspended"));
  assert.equal((await pedir(idsB["bruno@brisa.example"] ?? "", B.id, "GET /v1/tenant")).status, 403);
  await base.admin.enTenant(B.id, ({ equipo }) => equipo.cambiarEstadoTenant("active"));
  assert.equal((await pedir(idsB["bruno@brisa.example"] ?? "", B.id, "GET /v1/tenant")).status, 200);
});

test("demo: el resto del contrato sale de @jano/demo, con la misma comprobación de acceso", async () => {
  const { resolverDemo } = await import("@jano/demo");
  const conDemo = crearManejador({ db: base.db, directorio, servicios: serviciosDePrueba().servicios, demo: (m, p, b) => resolverDemo(m, p, b, 0) });
  const pedirDemo = async (quien: string, routeKey: string, rawPath: string, extra: Partial<EventoHttp> = {}) => {
    const r = await conDemo({
      routeKey,
      rawPath,
      requestContext: { requestId: "r", authorizer: { jwt: { claims: { sub: quien, "custom:tenant_id": A.id } } } },
      ...extra,
    });
    return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, unknown> };
  };
  // Una ruta que el backend aún no sirviera iría por la comodín; todas las del contrato ya son reales.
  const d = await pedirDemo(ana(), "GET /v1/{proxy+}", "/v1/dashboard/summary");
  assert.equal(d.status, 200);
  assert.ok(d.body["kpis"]);
  assert.equal((await pedirDemo(ana(), "GET /v1/{proxy+}", "/v1/nada")).status, 404);
  assert.equal((await pedirDemo(ana(), "POST /v1/{proxy+}", "/v1/campaigns", { body: "{}" })).status, 400);
  const c = await pedirDemo(ana(), "POST /v1/{proxy+}", "/v1/campaigns", { body: JSON.stringify({ prompt: "Clínicas dentales en Valencia", meetingsGoal: 5 }) });
  assert.equal(c.status, 201);
  // Un usuario sin acceso tampoco ve la demo; y sin `demo`, esas rutas no existen.
  assert.equal((await pedirDemo("sub-desconocido", "GET /v1/{proxy+}", "/v1/dashboard/summary")).status, 403);
  const sinDemo = await manejar({ routeKey: "GET /v1/{proxy+}", rawPath: "/v1/dashboard/summary", requestContext: { requestId: "r", authorizer: { jwt: { claims: { sub: ana(), "custom:tenant_id": A.id } } } } });
  assert.equal(sinDemo.statusCode, 404);
});
