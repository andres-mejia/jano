import assert from "node:assert/strict";
import { test } from "node:test";

import { type Account, AccountSchema, IcpSchema, TriggerSchema } from "@jano/domain";

import { DeterministicMailSender } from "../src/adapters/deterministas/correo";
import {
  DeterministicAccountScorer,
  DeterministicContactResolver,
  DeterministicDraftWriter,
  DeterministicIcpStructurer,
  DeterministicPlanificadorOrquestador,
  DeterministicReplyClassifier,
} from "../src/adapters/deterministas/ia";
import { DespertadorEnMemoria, RelojFijo } from "../src/adapters/deterministas/reloj";
import { DeterministicCompanySource, DeterministicWebReader } from "../src/adapters/deterministas/web";
import type { ContextoOrquestador } from "../src/ports/ia";

/** Adaptadores deterministas (spec 008 T012): reproducibles, sin red y con salidas válidas. */
const reloj = new RelojFijo(new Date("2026-10-29T09:00:00.000Z"));

const cuenta = (extra: Partial<Account> = {}): Account =>
  AccountSchema.parse({
    id: "11111111-1111-4111-8111-111111111111",
    campaignId: "22222222-2222-4222-8222-222222222222",
    name: "Viajes Azahar",
    domain: "viajes-azahar.example",
    city: "Valencia",
    cnae: null,
    revenueEur: null,
    employees: null,
    fitScore: 80,
    fitReasoning: "encaja",
    fitEvidence: [{ source: "web", summary: "portada", url: "https://viajes-azahar.example/", observedAt: "2026-10-29T09:00:00.000Z" }],
    trigger: null,
    status: "approved",
    createdAt: "2026-10-29T09:00:00.000Z",
    ...extra,
  });

const senal = TriggerSchema.parse({
  signal: "vacante_comercial",
  summary: "Publica una vacante de responsable comercial",
  evidence: { source: "web", summary: "Buscamos responsable comercial", url: "https://viajes-azahar.example/empleo", observedAt: "2026-10-29T09:00:00.000Z" },
});

test("Orquestador ICP: estructura la frase y una corrección cambia solo lo pedido", async () => {
  const o = new DeterministicIcpStructurer();
  const r = await o.estructurar("Agencias de viajes en la Comunitat Valenciana con facturación de más de 1 M€");
  assert.equal(r.icp.sector, "Agencias de viajes");
  assert.deepEqual(r.icp.cnae, ["7911"]);
  assert.deepEqual(r.icp.regions, ["Comunitat Valenciana"]);
  assert.equal(r.icp.revenueMinEur, 1_000_000);
  assert.ok(IcpSchema.safeParse(r.icp).success);
  assert.deepEqual(await o.estructurar("Agencias de viajes en la Comunitat Valenciana con facturación de más de 1 M€"), r);

  const a = await o.afinar(r.icp, "Añade la Región de Murcia");
  assert.deepEqual(a.icp, { ...r.icp, regions: ["Comunitat Valenciana", "Región de Murcia"] });
  const q = await o.afinar(a.icp, "Quita la Comunitat Valenciana");
  assert.deepEqual(q.icp.regions, ["Región de Murcia"]);
  assert.equal(q.icp.revenueMinEur, 1_000_000);
});

test("candidatas: entre 30 y 50 por región, con dominios .example y su origen", async () => {
  const lista = await new DeterministicCompanySource().buscar("Comunitat Valenciana", 50);
  assert.ok(lista.length >= 30 && lista.length <= 50);
  assert.ok(lista.every((e) => e.dominio.endsWith(".example") && e.origen.startsWith("osm:node/")));
  assert.deepEqual(await new DeterministicCompanySource().buscar("Comunitat Valenciana", 50), lista);
  assert.equal((await new DeterministicCompanySource().buscar("Comunitat Valenciana", 5)).length, 5);
});

test("lector web: una web caída o con robots.txt en contra es un motivo, no un error", async () => {
  const w = new DeterministicWebReader(reloj);
  assert.deepEqual(await w.leer("rutas-caida.example"), { ok: false, motivo: "La web no responde (tiempo agotado a los 10 s)." });
  assert.equal((await w.leer("rutas-robots.example")).ok, false);
  const ok = await w.leer("viajes-azahar.example");
  assert.ok(ok.ok && ok.paginas[0]?.url === "https://viajes-azahar.example/" && ok.paginas[0].leidaEn === "2026-10-29T09:00:00.000Z");
});

test("Account Finder: fit 0-100 con evidencia citada; la señal solo si la web la muestra", async () => {
  const w = new DeterministicWebReader(reloj);
  const s = new DeterministicAccountScorer();
  const icp = IcpSchema.parse({ sector: "Agencias de viajes", country: "ES", revenueMinEur: null, revenueMaxEur: null, employeesMin: null });
  const dominios = (await new DeterministicCompanySource().buscar("Valencia", 50)).map((e) => e.dominio).filter((d) => !/caida|robots/.test(d));
  let conSenal = 0;
  for (const dominio of dominios) {
    const l = await w.leer(dominio);
    assert.ok(l.ok);
    const p = await s.puntuar({ icp, empresa: { nombre: dominio, dominio, ciudad: null, origen: "manual" }, paginas: l.paginas });
    assert.ok(p.fitScore >= 0 && p.fitScore <= 100);
    assert.equal(p.evidencia[0]?.url, `https://${dominio}/`);
    assert.match(p.razonamiento, /sin dato registral/);
    if (p.senal) {
      conSenal++;
      assert.ok(l.paginas.some((pg) => pg.url === p.senal?.evidence.url));
    }
  }
  assert.ok(conSenal > 0 && conSenal < dominios.length);
});

test("Contact Finder: un cargo y su motivo, nunca una persona", async () => {
  const c = await new DeterministicContactResolver().proponer({ cuenta: cuenta({ trigger: senal }) });
  assert.equal(c.cargo, "Dirección comercial");
  assert.ok(c.motivo.length > 0);
});

test("Response: clasifica por intención", async () => {
  const r = new DeterministicReplyClassifier();
  const casos: [string, string][] = [
    ["Me interesa, ¿hablamos el jueves?", "interest"],
    ["Por favor, dadme de baja", "opt_out"],
    ["Estoy fuera de la oficina hasta el lunes", "out_of_office"],
    ["Ahora no, mejor el año que viene", "not_now"],
    ["Es muy caro para nosotros", "objection"],
    ["No soy la persona que lleva esto", "wrong_person"],
    ["Recibido", "other"],
  ];
  for (const [texto, intent] of casos) assert.equal((await r.clasificar({ texto })).intent, intent, texto);
});

test("redactor: borrador de paso y contestación con los huecos", async () => {
  const d = new DeterministicDraftWriter();
  const p = await d.redactarPaso({ cuenta: cuenta(), contacto: { nombre: "Gerencia (prueba)", cargo: "Gerencia" }, paso: { titulo: "Primer contacto", intencion: "Presentarse", dia: 0, rama: "consultiva" } });
  assert.match(p.asunto, /Viajes Azahar/);
  const huecos = [{ start: "2026-11-02T08:00:00.000Z", end: "2026-11-02T08:30:00.000Z", held: false }];
  const r = await d.redactarRespuesta({ cuenta: cuenta(), contacto: { nombre: "x", cargo: "Gerencia" }, respuesta: "Me interesa", intent: "interest", huecos, tono: "mas_breve" });
  assert.match(r.cuerpo, /^Te lo resumo: .*lunes, 2 de noviembre/);
  assert.equal(r.confianza, "alta");
});

const contexto = (extra: Partial<ContextoOrquestador>): ContextoOrquestador => ({
  punto: "paso_vencido",
  ahora: "2026-10-29T09:00:00.000Z",
  minutosPorDia: 1440,
  etapa: "in_sequence",
  rama: "consultiva",
  cambiadaDe: null,
  cuenta: cuenta(),
  paso: { id: "33333333-3333-4333-8333-333333333333", titulo: "Seguimiento", dia: 3 },
  enviados: 1,
  intent: null,
  menu: ["cambiar_rama", "esperar_hasta", "pedir_borrador", "detener", "escalar_a_humano", "descartar"],
  ...extra,
});

test("Orquestador: elige rama al aprobar la cuenta, cambia de rama con señal y pide borrador si no", async () => {
  const o = new DeterministicPlanificadorOrquestador();
  const menuAlta = ["planificar_secuencia", "escalar_a_humano", "descartar"] as const;
  assert.deepEqual((await o.proponerSiguienteAccion(contexto({ punto: "cuenta_aprobada", etapa: "enriched", rama: null, paso: null, menu: menuAlta }))).accion, {
    tipo: "planificar_secuencia",
    kind: "consultiva",
  });
  assert.deepEqual(
    (await o.proponerSiguienteAccion(contexto({ punto: "cuenta_aprobada", etapa: "enriched", rama: null, cuenta: cuenta({ trigger: senal }), menu: menuAlta }))).accion,
    { tipo: "planificar_secuencia", kind: "trigger" },
  );
  assert.deepEqual((await o.proponerSiguienteAccion(contexto({}))).accion, { tipo: "pedir_borrador", stepId: "33333333-3333-4333-8333-333333333333" });
  const cambio = await o.proponerSiguienteAccion(contexto({ cuenta: cuenta({ trigger: senal }) }));
  assert.deepEqual(cambio.accion, { tipo: "cambiar_rama", to: "trigger" });
  assert.ok(cambio.evidencia.includes("https://viajes-azahar.example/empleo"));
  // Sin envíos todavía, o ya cambiada, no propone cambiar.
  assert.equal((await o.proponerSiguienteAccion(contexto({ cuenta: cuenta({ trigger: senal }), enviados: 0 }))).accion.tipo, "pedir_borrador");
  assert.equal((await o.proponerSiguienteAccion(contexto({ cuenta: cuenta({ trigger: senal }), cambiadaDe: "consultiva", rama: "trigger" }))).accion.tipo, "pedir_borrador");
});

test("Orquestador: una ausencia espera una semana de secuencia; el resto de respuestas va a la persona", async () => {
  const o = new DeterministicPlanificadorOrquestador();
  const base = { punto: "respuesta_clasificada" as const, etapa: "replied" as const, paso: null, menu: ["esperar_hasta", "escalar_a_humano"] as const };
  assert.deepEqual((await o.proponerSiguienteAccion(contexto({ ...base, intent: "out_of_office", minutosPorDia: 5 }))).accion, {
    tipo: "esperar_hasta",
    at: "2026-10-29T09:35:00.000Z",
  });
  assert.equal((await o.proponerSiguienteAccion(contexto({ ...base, intent: "interest" }))).accion.tipo, "escalar_a_humano");
});

test("Orquestador: la revisión de campaña señala el cuello de botella", async () => {
  const o = new DeterministicPlanificadorOrquestador();
  const r = await o.revisarCampana({ campaignName: "Agencias", actuales: { in_sequence: 12, replied: 2, meeting: 1 }, cuentasEncontradas: 40, aplazadosHoy: 3 });
  assert.equal(r.cuello, "in_sequence");
  assert.equal(r.propuesta?.texto, "Añadir un segundo buzón");
  assert.equal((await o.revisarCampana({ campaignName: "x", actuales: {}, cuentasEncontradas: 0, aplazadosHoy: 0 })).cuello, null);
});

test("correo en memoria: idempotente y con fallo simulado", async () => {
  const c = new DeterministicMailSender();
  const correo = { para: "x@faro.example", asunto: "a", cuerpo: "b", token: "t", idempotencia: "paso-1", enRespuestaA: null, reunion: null };
  const a = await c.enviar(correo);
  assert.deepEqual(await c.enviar(correo), a);
  assert.equal(c.enviados.length, 1);
  c.fallar = new Error("SES caído");
  await assert.rejects(c.enviar({ ...correo, idempotencia: "paso-2" }), /SES caído/);
});

test("despertador en memoria: adelantar solo acerca la fecha", async () => {
  const d = new DespertadorEnMemoria();
  assert.equal(await d.leer(), null);
  await d.fijar({ proximo: new Date("2026-10-30T00:00:00Z"), revisadoEn: new Date("2026-10-29T09:00:00Z") });
  await d.adelantar(new Date("2026-10-31T00:00:00Z"));
  assert.equal((await d.leer())?.proximo?.toISOString(), "2026-10-30T00:00:00.000Z");
  await d.adelantar(new Date("2026-10-29T10:00:00Z"));
  assert.equal((await d.leer())?.proximo?.toISOString(), "2026-10-29T10:00:00.000Z");
});
