import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";

import type { Account, CandidateJob, InboxItem, Prospect, ProspectDetail, ProspectEvent } from "@jano/domain";

import { RelojFijo } from "../src/adapters/deterministas/reloj";
import { crearManejador, type EventoHttp, RUTAS, RUTAS_PUBLICAS } from "../src/adapters/http";
import { procesarMensaje } from "../src/application/analizar-cuentas";
import { ejecutarMotor } from "../src/application/ejecutar-motor";
import { registrarRespuesta } from "../src/application/respuestas";
import { REGLA } from "../src/domain/motor/reglas";
import type { Db } from "../src/ports/db";
import type { PlanificadorOrquestador } from "../src/ports/ia";
import { DirectorioEnMemoria } from "./directorio-memoria";
import { type BaseDePruebas, baseDePruebas } from "./pg";
import { A, B, sembrarTenant } from "./semilla";
import { serviciosDePrueba } from "./servicios-prueba";

/**
 * El motor de punta a punta contra Postgres (spec 008 T014, T015): campaña,
 * candidatas, aprobación, pasos del motor, reglas, cambio de rama, respuesta,
 * reunión, oportunidad, baja y vistas. Por la API, con los esquemas del contrato
 * validando cada respuesta, y con los agentes deterministas.
 */
let base: BaseDePruebas;
let ids: Record<string, string>;
let idsB: Record<string, string>;
const reloj = new RelojFijo(new Date());
const prueba = serviciosDePrueba({ reloj, minutosPorDia: 1 });
const { servicios, correo, despertador, cola } = prueba;
/** El trabajador de cuentas, como lo haría SQS: hasta que la cola queda vacía. */
const vaciarCola = () => cola.vaciar(async (m) => void (await procesarMensaje(base.db, servicios, m)));
let manejar: ReturnType<typeof crearManejador>;

before(async () => {
  base = await baseDePruebas();
  ids = await sembrarTenant(base.admin, A, [{ email: "alba@faro.example", role: "member", status: "active" }]);
  idsB = await sembrarTenant(base.admin, B);
  manejar = crearManejador({ db: base.db, directorio: new DirectorioEnMemoria(), servicios });
});
after(() => base.cerrar());

type Cuerpo = Record<string, unknown> & unknown[];
async function pedir(routeKey: string, extra: Partial<EventoHttp> = {}, quien = ids["ana@faro.example"] ?? "", tenant: string = A.id) {
  const r = await manejar({ routeKey, requestContext: { requestId: "r", authorizer: { jwt: { claims: { sub: quien, "custom:tenant_id": tenant } } } }, ...extra });
  const json = r.headers["content-type"]?.includes("json");
  return { status: r.statusCode, body: (json ? JSON.parse(r.body) : r.body) as Cuerpo, headers: r.headers, texto: r.body };
}
const conCuerpo = (body: unknown, pathParameters: Record<string, string> = {}): Partial<EventoHttp> => ({ body: JSON.stringify(body), pathParameters });

let campana = "";
let consultiva: Account;
let conSenal: Account;
let pConsultiva = "";
let pSenal = "";

const detalle = async (id: string) => (await pedir("GET /v1/prospects/{prospectId}", { pathParameters: { prospectId: id } })).body as unknown as ProspectDetail;
const eventos = async (id: string) => (await pedir("GET /v1/prospects/{prospectId}/events", { pathParameters: { prospectId: id } })).body as unknown as ProspectEvent[];
const pasos = async (id: string) => (await detalle(id)).prospect.sequence?.steps ?? [];

test("contrato: cada operación de jano-api.yaml tiene su ruta y ninguna ruta queda fuera", () => {
  const yaml = readFileSync(new URL("../../contracts/openapi/jano-api.yaml", import.meta.url), "utf8");
  const operaciones: string[] = [];
  let ruta = "";
  for (const linea of yaml.split("\n")) {
    const p = /^ {2}(\/\S*):\s*$/.exec(linea);
    if (p?.[1]) ruta = p[1];
    const m = /^ {4}(get|post|put|delete):\s*$/.exec(linea);
    if (m?.[1] && ruta) operaciones.push(`${m[1].toUpperCase()} /v1${ruta}`);
    if (/^components:/.test(linea)) break;
  }
  const servidas = new Set([...Object.keys(RUTAS), ...Object.keys(RUTAS_PUBLICAS)]);
  assert.deepEqual(operaciones.filter((o) => !servidas.has(o)), [], "operaciones sin handler");
  assert.deepEqual([...servidas].filter((s) => !operaciones.includes(s)), [], "rutas fuera del contrato");
});

test("US1: una frase crea la campaña con ICP y una corrección cambia solo lo pedido", async () => {
  const r = await pedir("POST /v1/campaigns", conCuerpo({ prompt: "Agencias de viajes en la Comunitat Valenciana con facturación de más de 1 M€", meetingsGoal: 5 }));
  assert.equal(r.status, 201);
  const c = r.body["campaign"] as { id: string; icp: Record<string, unknown>; status: string };
  campana = c.id;
  assert.equal(c.status, "draft");
  assert.deepEqual(c.icp["regions"], ["Comunitat Valenciana"]);

  const t = await pedir("POST /v1/campaigns/{campaignId}/icp", conCuerpo({ text: "Añade la Región de Murcia" }, { campaignId: campana }));
  assert.equal(t.status, 200);
  const despues = (await pedir("GET /v1/campaigns/{campaignId}", { pathParameters: { campaignId: campana } })).body as unknown as { icp: Record<string, unknown> };
  assert.deepEqual(despues.icp, { ...c.icp, regions: ["Comunitat Valenciana", "Región de Murcia"] });
  const turnos = (await pedir("GET /v1/campaigns/{campaignId}/icp", { pathParameters: { campaignId: campana } })).body;
  assert.deepEqual(turnos.map((x) => (x as { role: string }).role), ["user", "jano", "user", "jano"]);

  const activa = await pedir("PUT /v1/campaigns/{campaignId}/status", conCuerpo({ status: "active" }, { campaignId: campana }));
  assert.equal((activa.body as unknown as { status: string }).status, "active");
});

test("US2: candidatas de la región puntuadas con evidencia en segundo plano; las ilegibles, descartadas con motivo", async () => {
  const r = await pedir("POST /v1/campaigns/{campaignId}/accounts/candidates", conCuerpo({ region: "Comunitat Valenciana" }, { campaignId: campana }));
  assert.equal(r.status, 202);
  const job = r.body as unknown as CandidateJob;
  assert.equal(job.mode, "region");
  assert.equal(job.queued, 0);
  // Nada se lee dentro de la petición: la búsqueda queda en la cola.
  assert.equal((await pedir("GET /v1/campaigns/{campaignId}/accounts", { pathParameters: { campaignId: campana } })).body.length, 0);
  assert.deepEqual(cola.pendientes.map((m) => m.tipo), ["region"]);
  const mensajes = await vaciarCola();
  assert.ok(mensajes > 30 && mensajes <= 51);
  assert.ok(cola.entregados.every((m) => m.jobId === job.jobId && m.tenantId === A.id));

  const cuentas = (await pedir("GET /v1/campaigns/{campaignId}/accounts", { pathParameters: { campaignId: campana }, rawQueryString: "limit=200" })).body as unknown as Account[];
  assert.ok(cuentas.length >= 30 && cuentas.length <= 50);
  assert.ok(cuentas.some((a) => a.status === "discarded"));
  for (const a of cuentas) {
    if (a.status === "discarded") {
      assert.equal(a.fitScore, 0);
      assert.equal(a.fitEvidence.length, 0);
      assert.match(a.fitReasoning, /^Sin puntuar: /);
    } else {
      assert.ok(a.fitEvidence[0]?.url?.startsWith(`https://${a.domain}/`));
      assert.equal(a.revenueEur, null);
    }
  }
  // La segunda búsqueda sale de la caché y no repite dominios.
  await pedir("POST /v1/campaigns/{campaignId}/accounts/candidates", conCuerpo({ region: "Comunitat Valenciana" }, { campaignId: campana }));
  assert.equal(await vaciarCola(), 1);

  const manual = await pedir("POST /v1/campaigns/{campaignId}/accounts/candidates", conCuerpo({ domains: ["https://www.viajes-faro.example/", "viajes-faro.example", cuentas[0]?.domain ?? ""] }, { campaignId: campana }));
  assert.equal(manual.status, 202);
  assert.deepEqual({ ...(manual.body as unknown as CandidateJob), jobId: "", acceptedAt: "" }, {
    jobId: "",
    campaignId: campana,
    mode: "domains",
    region: null,
    queued: 1,
    skipped: 2,
    attribution: null,
    acceptedAt: "",
  });
  assert.equal(await vaciarCola(), 1);
  const faro = (await pedir("GET /v1/campaigns/{campaignId}/accounts", { pathParameters: { campaignId: campana }, rawQueryString: "limit=200" })).body as unknown as Account[];
  assert.ok(faro.some((a) => a.domain === "viajes-faro.example"));
  assert.equal((await pedir("POST /v1/campaigns/{campaignId}/accounts/candidates", conCuerpo({ domains: [] }, { campaignId: campana }))).status, 400);

  const lista = (await pedir("GET /v1/campaigns/{campaignId}/accounts", { pathParameters: { campaignId: campana }, rawQueryString: "status=found" })).body as unknown as Account[];
  const sin = lista.find((a) => !a.trigger);
  const con = lista.find((a) => a.trigger);
  assert.ok(sin && con);
  consultiva = sin;
  conSenal = con;
});

test("US3: aprobar cuentas crea prospects con destinatario de la lista blanca y su secuencia", async () => {
  const r = await pedir("POST /v1/campaigns/{campaignId}/accounts/approve", conCuerpo({ accountIds: [consultiva.id, conSenal.id] }, { campaignId: campana }));
  assert.equal(r.status, 202);
  assert.equal(r.body["approved"], 2);
  const otra = await pedir("POST /v1/campaigns/{campaignId}/accounts/approve", conCuerpo({ accountIds: [consultiva.id] }, { campaignId: campana }));
  assert.equal(otra.body["approved"], 0);

  const enSecuencia = (await pedir("GET /v1/campaigns/{campaignId}/flow/{stage}/events", { pathParameters: { campaignId: campana, stage: "in_sequence" } }))
    .body as unknown as ProspectEvent[];
  const prospects = [...new Set(enSecuencia.map((e) => e.prospectId))];
  assert.equal(prospects.length, 2);
  for (const id of prospects) {
    const d = await detalle(id);
    if (d.account.id === consultiva.id) pConsultiva = id;
    else pSenal = id;
    assert.match(d.contact?.email ?? "", /^demo\.jano\+.+@correo\.example$/);
    assert.match(d.contact?.name ?? "", /\(prueba\)$/);
    assert.equal(d.prospect.stage, "in_sequence");
  }
  assert.equal((await detalle(pConsultiva)).prospect.sequence?.kind, "consultiva");
  assert.equal((await detalle(pSenal)).prospect.sequence?.kind, "trigger");

  const ev = await eventos(pConsultiva);
  assert.deepEqual(ev.map((e) => [e.agent, e.type]), [
    ["contact_finder", "decision"],
    ["orchestrator", "decision"],
  ]);
  assert.match(ev[1]?.summary ?? "", /Planifica la secuencia consultiva/);
  assert.ok(ev[1]?.reasoning);
  const s = await pasos(pConsultiva);
  assert.ok(s[0]?.scheduledFor && s.slice(1).every((p) => p.scheduledFor === null));
});

test("T015: el motor deja cada paso vencido en espera de aprobación una sola vez, aunque corra dos veces a la vez", async () => {
  let consultas = 0;
  const contador: Db = { ...base.db, enTenant: base.db.enTenant.bind(base.db), resolverToken: base.db.resolverToken.bind(base.db), agendaDelMotor: (a) => (consultas++, base.db.agendaDelMotor(a)) };
  const [a, b] = await Promise.all([ejecutarMotor(contador, servicios), ejecutarMotor(contador, servicios)]);
  assert.equal(a.procesados + b.procesados, 2);

  for (const id of [pConsultiva, pSenal]) {
    const s = await pasos(id);
    assert.equal(s[0]?.status, "awaiting_approval");
    const borradores = (await eventos(id)).filter((e) => e.agent === "outreach" && e.stepId === s[0]?.id);
    assert.equal(borradores.length, 1, "un solo borrador por paso");
    assert.equal(borradores[0]?.rulesChecked.length, 5);
    assert.ok(borradores[0]?.message?.body);
  }

  // Tercera pasada: nada vence y el despertador evita consultar la base de datos.
  const antes = consultas;
  assert.deepEqual(await ejecutarMotor(contador, servicios), { salida: "nada_vencido", procesados: 0 });
  assert.equal(consultas, antes);
});

test("US3: aprobar el paso comprueba las reglas, envía y planifica el siguiente", async () => {
  const [paso] = await pasos(pConsultiva);
  assert.ok(paso);
  const r = await pedir("POST /v1/prospects/{prospectId}/steps/{stepId}/approve", { pathParameters: { prospectId: pConsultiva, stepId: paso.id } });
  assert.equal(r.status, 200);
  const ev = r.body["event"] as ProspectEvent;
  assert.equal(ev.type, "sent");
  assert.deepEqual(ev.rulesChecked.map((c) => [c.rule, c.passed]), Object.values(REGLA).map((x) => [x, true]));
  assert.equal(correo.enviados.length, 1);
  assert.match(correo.enviados[0]?.para ?? "", /^demo\.jano\+/);

  const s = await pasos(pConsultiva);
  assert.equal(s[0]?.status, "sent");
  // Día 0 → día 3 con un «día» de 1 minuto.
  assert.ok(s[1]?.scheduledFor);
  const mins = (Date.parse(s[1]?.scheduledFor ?? "") - reloj.ahora().getTime()) / 60_000;
  assert.ok(mins > 2.9 && mins <= 3.01, String(mins));
  assert.equal((await detalle(pConsultiva)).account.status, "contacted");
  assert.ok(despertador.estado?.proximo);

  const otra = await pedir("POST /v1/prospects/{prospectId}/steps/{stepId}/approve", { pathParameters: { prospectId: pConsultiva, stepId: paso.id } });
  assert.equal(otra.status, 409);
});

test("US4b: con una señal nueva a mitad de la consultiva, el Orquestador propone cambiar de rama y aprobarlo la cambia", async () => {
  await base.admin.enTenantSql(A.id, (tx) =>
    tx.query("update accounts set trigger = (select trigger from accounts where id = cast(:con as uuid)) where id = cast(:sin as uuid)", { con: conSenal.id, sin: consultiva.id }),
  );
  reloj.avanzar(4);
  const pasada = await ejecutarMotor(base.db, servicios);
  assert.equal(pasada.procesados, 1);

  const ev = await eventos(pConsultiva);
  const cambio = ev.find((e) => e.agent === "orchestrator" && /cambiar a la secuencia por señal/.test(e.summary));
  assert.ok(cambio?.reasoning && cambio.evidence.length > 0);
  let s = await pasos(pConsultiva);
  const propuesta = s.find((p) => p.status === "awaiting_approval");
  assert.equal(propuesta?.title, "Email por señal de compra");
  assert.equal(s[1]?.status, "planned");
  assert.equal(s[1]?.scheduledFor, null, "el paso consultivo queda en pausa");

  const r = await pedir("POST /v1/prospects/{prospectId}/steps/{stepId}/approve", { pathParameters: { prospectId: pConsultiva, stepId: propuesta?.id ?? "" } });
  assert.equal(r.status, 200);
  const p = r.body["prospect"] as Prospect;
  assert.equal(p.sequence?.kind, "trigger");
  assert.equal(p.sequence?.switchedFrom, "consultiva");
  s = p.sequence?.steps ?? [];
  assert.deepEqual(s.map((x) => x.status), ["sent", "skipped", "skipped", "skipped", "sent", "planned", "planned"]);
  assert.ok(s[5]?.scheduledFor && !s[6]?.scheduledFor);
});

test("FR-005: si el envío falla, el paso queda blocked con el error y nada más cambia", async () => {
  const [paso] = await pasos(pSenal);
  correo.fallar = new Error("proveedor caído");
  const r = await pedir("POST /v1/prospects/{prospectId}/steps/{stepId}/approve", { pathParameters: { prospectId: pSenal, stepId: paso?.id ?? "" } });
  correo.fallar = null;
  assert.equal(r.status, 409);
  assert.equal((r.body["event"] as ProspectEvent).type, "blocked");
  const s = await pasos(pSenal);
  assert.equal(s[0]?.status, "blocked");
  assert.ok(s.slice(1).every((x) => x.status === "planned" && x.scheduledFor === null), "no se planificó el siguiente");
  assert.equal((await detalle(pSenal)).account.status, "approved");
});

test("reglas: la supresión bloquea y el límite diario aplaza a las 00:00 de Madrid", async () => {
  // Nuevo paso vencido en pSenal: una tercera cuenta para probar el límite sin tocar las anteriores.
  const lista = (await pedir("GET /v1/campaigns/{campaignId}/accounts", { pathParameters: { campaignId: campana }, rawQueryString: "status=found" })).body as unknown as Account[];
  const [x, y] = lista;
  await pedir("POST /v1/campaigns/{campaignId}/accounts/approve", conCuerpo({ accountIds: [x?.id, y?.id] }, { campaignId: campana }));
  await ejecutarMotor(base.db, { ...servicios, despertador: new (despertador.constructor as new () => typeof despertador)() });

  const g = await pedir("PUT /v1/compliance/guardrails", conCuerpo({ maxSendsPerMailboxPerDay: 2, requireVerifiedEmail: true, whatsappOnlyAfterReply: true, stopSequenceOnReply: true, autopilot: false }));
  assert.equal(g.status, 200);
  const autopiloto = await pedir("PUT /v1/compliance/guardrails", conCuerpo({ ...g.body, autopilot: true }), ids["alba@faro.example"]);
  assert.equal(autopiloto.status, 403);

  const prospects = (await pedir("GET /v1/campaigns/{campaignId}/flow/{stage}/events", { pathParameters: { campaignId: campana, stage: "in_sequence" } })).body as unknown as ProspectEvent[];
  const nuevos = [...new Set(prospects.map((e) => e.prospectId))].filter((id) => id !== pConsultiva && id !== pSenal);
  assert.equal(nuevos.length, 2);
  const [px, py] = nuevos as [string, string];

  // Supresión: la dirección de px pidió la baja por otra vía.
  const dx = await detalle(px);
  await base.admin.enTenantSql(A.id, (tx) => tx.query("insert into suppression_list (tenant_id, email, source) values (:t, :e, 'manual')", { t: A.id, e: dx.contact?.email ?? "" }));
  const sx = (await pasos(px))[0];
  const bx = await pedir("POST /v1/prospects/{prospectId}/steps/{stepId}/approve", { pathParameters: { prospectId: px, stepId: sx?.id ?? "" } });
  assert.equal(bx.status, 409);
  const evx = bx.body["event"] as ProspectEvent;
  assert.equal(evx.rulesChecked[0]?.passed, false);
  assert.equal((await pasos(px))[0]?.status, "blocked");

  // Límite: ya salieron 2 hoy (pConsultiva); el de py se aplaza, conserva la aprobación y pasa a «en espera».
  const sy = (await pasos(py))[0];
  const by = await pedir("POST /v1/prospects/{prospectId}/steps/{stepId}/approve", { pathParameters: { prospectId: py, stepId: sy?.id ?? "" } });
  assert.equal(by.status, 200);
  const evy = by.body["event"] as ProspectEvent;
  assert.equal(evy.type, "deferred");
  assert.equal(evy.rulesChecked[4]?.detail, "2 de 2");
  assert.equal((by.body["prospect"] as Prospect).stage, "waiting");
  const aplazado = (await pasos(py))[0];
  assert.equal(aplazado?.status, "planned");
  assert.equal(new Date(aplazado?.scheduledFor ?? "").toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid" }), "0:00:00");

  const resumen = (await pedir("GET /v1/dashboard/summary")).body;
  assert.match(String(resumen["guardrailNotice"]), /Límite diario del buzón alcanzado \(2 de 2\): 1 envíos pasan a mañana/);
  await pedir("PUT /v1/compliance/guardrails", conCuerpo({ ...g.body, maxSendsPerMailboxPerDay: 50 }));
});

let elemento: InboxItem;

test("US4: una respuesta detiene la secuencia en la misma transacción y deja el borrador con dos huecos", async () => {
  await base.db.enTenant(A.id, (uow) => registrarRespuesta(uow, servicios, { prospectId: pConsultiva, texto: "Me interesa, ¿hablamos la semana que viene?", recibidaEn: reloj.ahora(), messageId: "<r1@correo.example>" }));
  const d = await detalle(pConsultiva);
  assert.equal(d.prospect.stage, "replied");
  assert.ok(d.prospect.sequence?.steps.every((s) => s.status !== "planned" && s.status !== "awaiting_approval"));
  const ev = await eventos(pConsultiva);
  assert.ok(ev.some((e) => e.type === "stopped" && e.agent === "guardrail"));

  const bandeja = (await pedir("GET /v1/inbox")).body as unknown as InboxItem[];
  const primero = bandeja[0];
  assert.ok(primero);
  elemento = primero;
  assert.equal(elemento.intent, "interest");
  assert.equal(elemento.draft?.status, "pending_approval");
  assert.equal(elemento.draft?.slots.length, 2);
  assert.deepEqual(elemento.effects, ["send_reply", "hold_slots", "create_opportunity"]);

  const otro = await pedir("POST /v1/inbox/{itemId}/regenerate", conCuerpo({ tone: "mas_breve" }, { itemId: elemento.id }));
  assert.match(String((otro.body["draft"] as { body: string }).body), /^Te lo resumo: /);
});

test("FR-005: si la contestación no sale, no se aplica ningún efecto", async () => {
  correo.fallar = new Error("proveedor caído");
  const r = await pedir("POST /v1/inbox/{itemId}/approve", conCuerpo({}, { itemId: elemento.id }));
  correo.fallar = null;
  assert.equal(r.status, 409);
  assert.equal(r.headers["content-type"], "application/problem+json");
  const tras = (await pedir("GET /v1/inbox/{itemId}", { pathParameters: { itemId: elemento.id } })).body as unknown as InboxItem;
  assert.equal(tras.draft?.status, "pending_approval");
  assert.equal(((await pedir("GET /v1/opportunities")).body as unknown[]).length, 0);
  assert.equal((await detalle(pConsultiva)).prospect.stage, "replied");
  assert.ok((await eventos(pConsultiva)).some((e) => e.type === "blocked" && /ha fallado/.test(e.summary)));
});

test("US5: aprobar el borrador envía con la invitación, crea la oportunidad y el prospect pasa a meeting", async () => {
  const r = await pedir("POST /v1/inbox/{itemId}/approve", conCuerpo({ body: "Te propongo el lunes a las 9:00." }, { itemId: elemento.id }));
  assert.equal(r.status, 200);
  const item = r.body as unknown as InboxItem;
  assert.equal(item.draft?.status, "sent");
  assert.equal(item.draft?.body, "Te propongo el lunes a las 9:00.");
  assert.equal(item.draft?.slots[0]?.held, true);
  const enviado = correo.enviados.at(-1);
  assert.equal(enviado?.enRespuestaA, "<r1@correo.example>");
  assert.equal(enviado?.reunion?.start, elemento.draft?.slots[0]?.start);

  assert.equal((await detalle(pConsultiva)).prospect.stage, "meeting");
  assert.ok((await eventos(pConsultiva)).some((e) => e.type === "meeting_booked"));
  const ops = (await pedir("GET /v1/opportunities")).body as unknown as { accountName: string; meetingStart: string }[];
  assert.equal(ops.length, 1);
  assert.equal(ops[0]?.meetingStart, elemento.draft?.slots[0]?.start);

  const csv = await pedir("GET /v1/opportunities/export");
  assert.equal(csv.status, 200);
  assert.equal(csv.headers["content-type"], "text/csv; charset=utf-8");
  assert.match(csv.headers["content-disposition"] ?? "", /oportunidades\.csv/);
  assert.ok(csv.texto.startsWith("﻿Empresa;Dominio;Contacto;Cargo;Email;Reunión;Estado;Campaña;Creada\r\n"));
  assert.equal(csv.texto.trimEnd().split("\r\n").length, 2);
  assert.match(csv.texto, /;Abierta;/);
});

test("una baja por respuesta pasa a supresión sin esperar aprobación", async () => {
  await base.db.enTenant(A.id, (uow) => registrarRespuesta(uow, servicios, { prospectId: pSenal, texto: "Por favor, dadme de baja", recibidaEn: reloj.ahora(), messageId: null }));
  const d = await detalle(pSenal);
  assert.equal(d.prospect.stage, "opted_out");
  const item = ((await pedir("GET /v1/inbox", { rawQueryString: "intent=opt_out" })).body as unknown as InboxItem[])[0];
  assert.equal(item?.draft, null);
  assert.deepEqual(item?.effects, ["add_to_suppression", "stop_sequence"]);
  const audit = (await pedir("GET /v1/compliance/audit")).body as unknown as { ruleApplied: string | null; type: string }[];
  assert.ok(audit.some((a) => a.type === "opt_out" && a.ruleApplied === "Bajas al instante"));
});

test("FR-022: la baja pública por token, sin JWT, suprime y detiene; un token desconocido responde igual", async () => {
  const flujo = (await pedir("GET /v1/campaigns/{campaignId}/flow/{stage}/events", { pathParameters: { campaignId: campana, stage: "waiting" } })).body as unknown as ProspectEvent[];
  const py = flujo[0]?.prospectId ?? "";
  const [fila] = await base.admin.enTenantSql(A.id, (tx) => tx.query<{ token: string }>("select token from prospects where id = cast(:p as uuid)", { p: py }));
  const baja = (token: string) => manejar({ routeKey: "GET /v1/baja/{token}", pathParameters: { token }, requestContext: { requestId: "b" } });

  const r = await baja(fila?.token ?? "");
  assert.equal(r.statusCode, 200);
  assert.match(r.headers["content-type"] ?? "", /text\/html/);
  const d = await detalle(py);
  assert.equal(d.prospect.stage, "opted_out");
  assert.ok(d.prospect.sequence?.steps.every((s) => s.status !== "planned"));
  const otra = await baja(fila?.token ?? "");
  assert.equal(otra.body, r.body);
  assert.equal((await eventos(py)).filter((e) => e.type === "opt_out").length, 1, "idempotente");
  assert.equal((await baja("0".repeat(32))).body, r.body);
  assert.equal((await baja("no-es-un-token")).body, r.body);
});

test("FR-002: detener un prospect que respondió no está permitido: 409 y evento rejected registrado", async () => {
  const r = await pedir("POST /v1/prospects/{prospectId}/stop", { pathParameters: { prospectId: pConsultiva } });
  assert.equal(r.status, 409);
  assert.equal((r.body["event"] as ProspectEvent).type, "rejected");
  assert.equal((await eventos(pConsultiva)).at(-1)?.type, "rejected");
  assert.equal((await detalle(pConsultiva)).prospect.stage, "meeting");
});

test("detener un prospect en secuencia cancela sus pasos", async () => {
  const lista = (await pedir("GET /v1/campaigns/{campaignId}/accounts", { pathParameters: { campaignId: campana }, rawQueryString: "status=found" })).body as unknown as Account[];
  await pedir("POST /v1/campaigns/{campaignId}/accounts/approve", conCuerpo({ accountIds: [lista[0]?.id] }, { campaignId: campana }));
  const prospect = ((await pedir("GET /v1/campaigns/{campaignId}/flow/{stage}/events", { pathParameters: { campaignId: campana, stage: "in_sequence" } })).body as unknown as ProspectEvent[])[0]?.prospectId ?? "";
  const r = await pedir("POST /v1/prospects/{prospectId}/stop", { pathParameters: { prospectId: prospect } });
  assert.equal(r.status, 200);
  const p = r.body["prospect"] as Prospect;
  assert.equal(p.stage, "discarded");
  assert.ok(p.sequence?.steps.every((s) => s.status === "cancelled"));
});

test("Orquestador: una propuesta fuera del menú se rechaza, queda registrada y decide una persona", async () => {
  const caprichoso: PlanificadorOrquestador = {
    proponerSiguienteAccion: async () => ({ accion: { tipo: "planificar_secuencia", kind: "trigger" }, razonamiento: "Empezar de nuevo", evidencia: [] }),
    revisarCampana: servicios.agentes.orquestador.revisarCampana.bind(servicios.agentes.orquestador),
  };
  const otro = serviciosDePrueba({ reloj, minutosPorDia: 1, agentes: { orquestador: caprichoso } });
  const lista = (await pedir("GET /v1/campaigns/{campaignId}/accounts", { pathParameters: { campaignId: campana }, rawQueryString: "status=found" })).body as unknown as Account[];
  await pedir("POST /v1/campaigns/{campaignId}/accounts/approve", conCuerpo({ accountIds: [lista[0]?.id] }, { campaignId: campana }));
  const prospect = ((await pedir("GET /v1/campaigns/{campaignId}/flow/{stage}/events", { pathParameters: { campaignId: campana, stage: "in_sequence" } })).body as unknown as ProspectEvent[])[0]?.prospectId ?? "";
  await ejecutarMotor(base.db, otro.servicios);

  const ev = await eventos(prospect);
  const rechazo = ev.find((e) => e.type === "rejected" && e.agent === "orchestrator");
  assert.match(rechazo?.summary ?? "", /no está permitida con el prospect en secuencia/);
  assert.equal(rechazo?.reasoning, "Empezar de nuevo");
  assert.ok(ev.some((e) => e.agent === "orchestrator" && e.type === "decision" && /Lo deja en tus manos/.test(e.summary)));
  assert.equal((await pasos(prospect))[0]?.status, "awaiting_approval");
});

test("vistas: centro de mando, flujo, auditoría y cumplimiento salen del registro", async () => {
  const d = (await pedir("GET /v1/dashboard/summary")).body;
  assert.equal(d["campaignId"], campana);
  const funnel = Object.fromEntries((d["funnel"] as { key: string; value: number }[]).map((f) => [f.key, f.value]));
  assert.ok(funnel["found"] && funnel["found"] >= 30);
  // Solo pConsultiva llegó a recibir correo: el de pSenal falló y el de py se aplazó.
  assert.equal(funnel["contacted"], 1);
  assert.equal(funnel["replied"], 2);
  assert.equal(funnel["meetings"], 1);
  assert.ok((d["pending"] as { kind: string }[]).some((p) => p.kind === "step_approval"));
  assert.ok((d["pending"] as { kind: string }[]).some((p) => p.kind === "accounts_approval"));
  assert.ok(d["insight"], "la lectura del Orquestador guardada por el motor");
  // Varias pasadas del motor hoy, una sola lectura por campaña (FR-017).
  const lecturas = await base.admin.enTenantSql(A.id, (tx) => tx.query("select 1 from campaign_reviews where campaign_id = cast(:c as uuid)", { c: campana }));
  assert.equal(lecturas.length, 1);

  const f = (await pedir("GET /v1/campaigns/{campaignId}/flow", { pathParameters: { campaignId: campana } })).body;
  const nodos = Object.fromEntries((f["nodes"] as { stage: string; value: number }[]).map((n) => [n.stage, n.value]));
  assert.equal(nodos["meeting"], 1);
  assert.ok(nodos["found"] && nodos["enriched"] && nodos["enriched"] >= 5);

  const audit = (await pedir("GET /v1/compliance/audit", { rawQueryString: "limit=5" })).body as unknown[];
  assert.equal(audit.length, 5);
  const c = (await pedir("GET /v1/compliance/summary")).body;
  // Dos pasos de pConsultiva y la contestación con la reunión.
  assert.equal(c["sendsToday"], 3);
  assert.equal(c["legalOpinionPending"], true);
  assert.equal(((await pedir("GET /v1/connections")).body as unknown[]).length, 1);
});

test("aislamiento por la API: otro tenant no ve la campaña ni los prospects", async () => {
  const bruno = idsB["bruno@brisa.example"] ?? "";
  assert.equal((await pedir("GET /v1/campaigns/{campaignId}", { pathParameters: { campaignId: campana } }, bruno, B.id)).status, 404);
  assert.equal((await pedir("GET /v1/prospects/{prospectId}", { pathParameters: { prospectId: pConsultiva } }, bruno, B.id)).status, 404);
  assert.deepEqual((await pedir("GET /v1/campaigns", {}, bruno, B.id)).body, []);
  assert.deepEqual((await pedir("GET /v1/opportunities", {}, bruno, B.id)).body, []);
  const vacio = (await pedir("GET /v1/dashboard/summary", {}, bruno, B.id)).body;
  assert.equal(vacio["campaignId"], null);
  assert.equal((await pedir("GET /v1/prospects/{prospectId}", { pathParameters: { prospectId: "no-uuid" } })).status, 404);
});
