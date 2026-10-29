import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { type Account, AccountSchema, IcpSchema } from "@jano/domain";

import {
  BedrockAccountScorer,
  BedrockContactResolver,
  BedrockDraftWriter,
  BedrockPlanificadorOrquestador,
  BedrockSelectorDeEnlaces,
  revisarCorreo,
} from "../src/adapters/bedrock/agentes";
import { ClienteModelo, type Conversador, type MensajeModelo, type RespuestaModelo, type TopeDeLlamadas, extraerJson } from "../src/adapters/bedrock/modelo";
import { prompt } from "../src/adapters/bedrock/prompts";
import { TopeEnPostgres } from "../src/adapters/bedrock/tope-postgres";
import { DeterministicDraftWriter } from "../src/adapters/deterministas/ia";
import { RelojFijo } from "../src/adapters/deterministas/reloj";
import { conTenant, tenantEnCurso } from "../src/application/contexto-tenant";
import { aprobarCuentas } from "../src/application/cuentas";
import { procesarPaso } from "../src/application/motor";
import { ATRIBUCION_OSM } from "../src/adapters/web/osm";
import { IaNoDisponible } from "../src/domain/errores";
import { modoAgentes, serviciosDesdeEntorno } from "../src/entrypoints/servicios";
import { type BaseDePruebas, baseDePruebas } from "./pg";
import { A, B, sembrarMotor, sembrarTenant } from "./semilla";
import { serviciosDePrueba } from "./servicios-prueba";

/**
 * Adaptadores Bedrock (spec 008 T022, T022b, T023) sin red: el transporte al modelo
 * es un guion de respuestas; el resto (PiiStripper, validación, reintento, tope y
 * motor) es el real. La prueba contra Bedrock es `scripts/probar-agentes.ts`.
 */
const reloj = new RelojFijo(new Date("2026-10-29T09:00:00.000Z"));

class Guion implements Conversador {
  readonly modelo = "eu.anthropic.claude-sonnet-4-6";
  readonly peticiones: { sistema: string; mensajes: readonly MensajeModelo[] }[] = [];
  constructor(private readonly respuestas: (string | Error)[]) {}

  async conversar(p: { sistema: string; mensajes: readonly MensajeModelo[] }): Promise<RespuestaModelo> {
    this.peticiones.push({ sistema: p.sistema, mensajes: [...p.mensajes] });
    const r = this.respuestas.shift();
    if (r === undefined) throw new Error("el guion no tiene más respuestas");
    if (r instanceof Error) throw r;
    return { texto: r, tokensEntrada: 1000, tokensSalida: 200, latenciaMs: 1500, parada: "end_turn" };
  }
}

class TopeEnMemoria implements TopeDeLlamadas {
  llamadas = 0;
  coste = 0;
  constructor(private readonly maximo = 500) {}
  async reservar(_t: string, _d: string, tope: number) {
    if (this.llamadas >= Math.min(tope, this.maximo)) return false;
    this.llamadas++;
    return true;
  }
  async anotar(_t: string, _d: string, uso: { costeUsd: number }) {
    this.coste += uso.costeUsd;
  }
}

function cliente(respuestas: (string | Error)[], tope = new TopeEnMemoria()) {
  const guion = new Guion(respuestas);
  const lineas: Record<string, unknown>[] = [];
  const c = new ClienteModelo({ conversador: guion, tope, tenant: () => "tenant-faro", reloj, registrar: (l) => lineas.push(l) });
  return { c, guion, lineas, tope };
}

const cuenta = (): Account =>
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
    fitReasoning: "Agencia de viajes de empresa en Valencia.",
    fitEvidence: [{ source: "web", summary: "Viajes de empresa y congresos", url: "https://viajes-azahar.example/", observedAt: "2026-10-29T09:00:00.000Z" }],
    trigger: null,
    status: "approved",
    createdAt: "2026-10-29T09:00:00.000Z",
  });

const icp = IcpSchema.parse({ sector: "Agencias de viajes", cnae: ["7911"], country: "ES", regions: ["Comunitat Valenciana"], revenueMinEur: null, revenueMaxEur: null, employeesMin: null });
const paginas = [
  { url: "https://viajes-azahar.example/", titulo: "Viajes Azahar", texto: "Agencia de viajes de empresa en Valencia. Tel. 961 234 567, reservas@viajes-azahar.example. CIF B12345678.", leidaEn: "2026-10-29T09:00:00.000Z" },
  { url: "https://viajes-azahar.example/empleo", titulo: "Empleo", texto: "Buscamos responsable comercial. Publicado el 1 de octubre de 2026.", leidaEn: "2026-10-29T09:00:05.000Z" },
];
const empresa = { nombre: "Viajes Azahar", dominio: "viajes-azahar.example", ciudad: "Valencia", origen: "osm:node/1" };

test("los prompts están versionados y empiezan por las reglas comunes", () => {
  for (const n of ["icp-estructurar", "icp-afinar", "enlaces", "cuentas", "contactos", "redactar-paso", "redactar-respuesta", "respuestas", "orquestador", "revision"]) {
    const p = prompt(n);
    assert.match(p.version, /^v\d+\+comun\.v\d+$/, n);
    assert.match(p.texto, /^# Reglas comunes de los agentes de Jano/, n);
  }
});

test("AGENTES elige los adaptadores: deterministas por defecto, bedrock en dev", () => {
  assert.equal(modoAgentes({}), "deterministas");
  assert.equal(modoAgentes({ AGENTES: "bedrock" }), "bedrock");
  assert.throws(() => modoAgentes({ AGENTES: "langchain" }), /AGENTES debe ser/);
  const env = { AGENTES: "bedrock", CUENTAS_QUEUE_URL: "https://sqs.eu-west-1.amazonaws.com/1/cola", MOTOR_PARAMETER: "/jano/test/motor/proximo" };
  const s = serviciosDesdeEntorno(env, base.db);
  assert.ok(s.agentes.cuentas instanceof BedrockAccountScorer);
  assert.equal(s.empresas.atribucion, ATRIBUCION_OSM);
  assert.match(s.config.conexiones.find((c) => c.kind === "llm")?.detail ?? "", /eu\.anthropic\.claude-sonnet-4-6/);
  assert.ok(!(serviciosDesdeEntorno({ ...env, AGENTES: "deterministas" }, base.db).agentes.cuentas instanceof BedrockAccountScorer));
});

test("el JSON se extrae aunque venga entre ``` o con texto alrededor", () => {
  assert.deepEqual(extraerJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extraerJson('Aquí va:\n{"a":{"b":2}}\nGracias'), { a: { b: 2 } });
  assert.equal(extraerJson("sin json"), undefined);
});

test("Account Finder: el modelo no ve datos personales, cita las páginas leídas y la señal lleva fecha", async () => {
  const { c, guion, lineas } = cliente([
    JSON.stringify({
      fitScore: 82,
      razonamiento: "Agencia de viajes de empresa en Valencia, dentro de la región del ICP.",
      evidencias: [{ url: "https://viajes-azahar.example/", cita: "Agencia de viajes de empresa en Valencia" }],
      senal: { tipo: "vacante_comercial", resumen: "Busca responsable comercial", url: "https://viajes-azahar.example/empleo", fecha: "1 de octubre de 2026" },
    }),
  ]);
  const r = await new BedrockAccountScorer(c).puntuar({ icp, empresa, paginas });
  assert.equal(r.fitScore, 82);
  assert.deepEqual(r.evidencia, [{ source: "web", summary: "Agencia de viajes de empresa en Valencia", url: "https://viajes-azahar.example/", observedAt: "2026-10-29T09:00:00.000Z" }]);
  assert.equal(r.senal?.signal, "vacante_comercial");
  assert.equal(r.senal?.summary, "Busca responsable comercial (1 de octubre de 2026)");
  assert.equal(r.senal?.evidence.observedAt, "2026-10-29T09:00:05.000Z");

  const enviado = guion.peticiones[0]?.mensajes[0]?.texto ?? "";
  assert.doesNotMatch(enviado, /961 234 567|reservas@|B12345678/);
  assert.match(enviado, /\[TELÉFONO\].*\[EMAIL\].*\[NIF\]/s);
  assert.match(enviado, /"url": "https:\/\/viajes-azahar\.example\/empleo"/);
  assert.match(guion.peticiones[0]?.sistema ?? "", /Account Finder: puntuar el encaje/);
  const [l] = lineas;
  assert.equal(l?.["msg"], "ia_llamada");
  assert.equal(l?.["tenant_id"], "tenant-faro");
  assert.equal(l?.["agente"], "account_finder");
  assert.equal(l?.["modelo"], "eu.anthropic.claude-sonnet-4-6");
  assert.equal(l?.["tokens_entrada"], 1000);
  assert.equal(l?.["latencia_ms"], 1500);
  assert.equal(l?.["coste_usd"], 0.0066);
  assert.deepEqual(l?.["pii"], { aplicado: true, sustituciones: { email: 1, nif: 1, telefono: 1 } });
});

test("una evidencia con una URL no leída se reintenta una vez con el motivo", async () => {
  const mala = JSON.stringify({ fitScore: 70, razonamiento: "Encaja.", evidencias: [{ url: "https://viajes-azahar.example/inventada", cita: "x" }], senal: null });
  const buena = JSON.stringify({ fitScore: 70, razonamiento: "Encaja.", evidencias: [{ url: "https://viajes-azahar.example/", cita: "Agencia" }], senal: null });
  const { c, guion, lineas } = cliente([mala, buena]);
  const r = await new BedrockAccountScorer(c).puntuar({ icp, empresa, paginas });
  assert.equal(r.evidencia[0]?.url, "https://viajes-azahar.example/");
  assert.equal(guion.peticiones.length, 2);
  const correccion = guion.peticiones[1]?.mensajes ?? [];
  assert.deepEqual(correccion.map((m) => m.rol), ["user", "assistant", "user"]);
  assert.match(correccion[2]?.texto ?? "", /cada evidencia tiene que citar la URL de una de las páginas recibidas/);
  assert.deepEqual(lineas.map((l) => l["valida"]), [false, true]);
});

test("JSON inválido dos veces: fallo registrado y IaNoDisponible", async () => {
  const { c, lineas } = cliente(["no es json", '{"fitScore": 300}']);
  await assert.rejects(new BedrockAccountScorer(c).puntuar({ icp, empresa, paginas }), (e: unknown) => e instanceof IaNoDisponible && e.motivo === "salida_invalida");
  assert.equal(lineas.at(-1)?.["msg"], "ia_fallo");
  assert.match(String(lineas.at(-1)?.["motivo"]), /fitScore/);
});

test("tope diario: sin llamadas disponibles no se llama al modelo", async () => {
  const { c, guion, lineas } = cliente(['{"enlaces": []}'], new TopeEnMemoria(0));
  await assert.rejects(new BedrockSelectorDeEnlaces(c).elegir({ dominio: "x.example", portada: { titulo: null, texto: "x" }, enlaces: [], maximo: 3 }), (e: unknown) => e instanceof IaNoDisponible && e.motivo === "tope_diario");
  assert.equal(guion.peticiones.length, 0);
  assert.equal(lineas[0]?.["msg"], "ia_tope_diario");
});

test("sin tenant en curso no se llama al modelo; un error de Bedrock es IaNoDisponible", async () => {
  const guion = new Guion([new Error("ThrottlingException")]);
  const sin = new ClienteModelo({ conversador: guion, tope: new TopeEnMemoria(), tenant: () => null, reloj, registrar: () => {} });
  await assert.rejects(new BedrockContactResolver(sin).proponer({ cuenta: cuenta() }), /sin tenant/);
  assert.equal(guion.peticiones.length, 0);
  const con = new ClienteModelo({ conversador: guion, tope: new TopeEnMemoria(), tenant: () => "tenant-faro", reloj, registrar: () => {} });
  await assert.rejects(new BedrockContactResolver(con).proponer({ cuenta: cuenta() }), (e: unknown) => e instanceof IaNoDisponible && e.motivo === "error");
});

test("Contact Finder: un cargo, nunca un email o un teléfono", async () => {
  const { c, guion } = cliente([
    JSON.stringify({ cargo: "Gerencia (gerente@viajes-azahar.example)", motivo: "Decide.", evidencia: [] }),
    JSON.stringify({ cargo: "Gerencia", motivo: "En una agencia pequeña la gerencia decide la captación.", evidencia: ["https://viajes-azahar.example/"] }),
  ]);
  const r = await new BedrockContactResolver(c).proponer({ cuenta: cuenta() });
  assert.equal(r.cargo, "Gerencia");
  assert.match(guion.peticiones[1]?.mensajes[2]?.texto ?? "", /no incluyas emails/);
});

test("Outreach: un borrador de más de 120 palabras o con precio se rechaza; sin borrador válido, IaNoDisponible", async () => {
  assert.match(revisarCorreo(Array.from({ length: 121 }, () => "palabra").join(" "), "Asunto") ?? "", /121 palabras/);
  assert.equal(revisarCorreo("Te lo dejamos por 99 € al mes.", "Asunto"), "menciona un precio o un importe");
  assert.equal(revisarCorreo("Lo tienes en 48 horas.", "Asunto"), "promete un plazo o una garantía");
  assert.equal(revisarCorreo("Si no te interesa, puedes darte de baja.", "Asunto"), "incluye el pie o la baja, que añade el sistema");
  assert.equal(revisarCorreo("Hola: vi que organizáis viajes de empresa. ¿Lo hablamos 20 minutos?", "Viajes de empresa"), null);

  const largo = JSON.stringify({ asunto: "Viajes de empresa", cuerpo: Array.from({ length: 130 }, () => "texto").join(" "), razonamiento: "x" });
  const conPrecio = JSON.stringify({ asunto: "Viajes", cuerpo: "Desde 300 euros.", razonamiento: "x" });
  const { c } = cliente([largo, conPrecio]);
  await assert.rejects(
    new BedrockDraftWriter(c).redactarPaso({ cuenta: cuenta(), contacto: { nombre: "Gerencia (prueba)", cargo: "Gerencia" }, paso: { titulo: "Email personalizado", intencion: "Presentarse", dia: 0, rama: "consultiva" } }),
    (e: unknown) => e instanceof IaNoDisponible && e.motivo === "salida_invalida",
  );
});

// ── Tope en Postgres y Orquestador contra el motor real ───────────────────

let base: BaseDePruebas;
before(async () => {
  base = await baseDePruebas();
  await sembrarTenant(base.admin, A);
});
after(() => base.cerrar());

test("tope en Postgres: 500 por defecto, por tenant y día, con tokens y coste del día", async () => {
  const tope = new TopeEnPostgres(base.db);
  assert.equal(await tope.reservar(A.id, "2026-10-29", 2), true);
  assert.equal(await tope.reservar(A.id, "2026-10-29", 2), true);
  assert.equal(await tope.reservar(A.id, "2026-10-29", 2), false);
  assert.equal(await tope.reservar(A.id, "2026-10-30", 2), true);
  await tope.anotar(A.id, "2026-10-29", { tokensEntrada: 1000, tokensSalida: 200, costeUsd: 0.0066 });
  await tope.anotar(A.id, "2026-10-29", { tokensEntrada: 500, tokensSalida: 100, costeUsd: 0.0033 });
  const [fila] = await base.db.enTenantSql(A.id, (tx) =>
    tx.query<{ calls: number; input_tokens: string; output_tokens: string; cost_usd: string }>("select calls, input_tokens, output_tokens, cost_usd from ai_usage where day = '2026-10-29'"),
  );
  assert.deepEqual({ ...fila, input_tokens: Number(fila?.input_tokens), output_tokens: Number(fila?.output_tokens), cost_usd: Number(fila?.cost_usd) }, {
    calls: 2,
    input_tokens: 1500,
    output_tokens: 300,
    cost_usd: 0.0099,
  });
});

test("T022b: una propuesta del Orquestador fuera del menú queda rejected y pasa a una persona", async () => {
  // Contact Finder y Orquestador de Bedrock (con guion); el motor y la base de datos, reales.
  const otroDia = new RelojFijo(new Date("2026-11-02T09:00:00.000Z"));
  const guion = new Guion([
    JSON.stringify({ cargo: "Gerencia", motivo: "En una agencia pequeña decide la gerencia.", evidencia: [] }),
    JSON.stringify({ accion: { tipo: "cambiar_rama", to: "trigger" }, razonamiento: "Hay señal.", evidencia: [] }),
  ]);
  const c = new ClienteModelo({ conversador: guion, tope: new TopeEnPostgres(base.db), tenant: tenantEnCurso, reloj: otroDia, registrar: () => {} });
  const { servicios } = serviciosDePrueba({ reloj: otroDia, agentes: { contactos: new BedrockContactResolver(c), orquestador: new BedrockPlanificadorOrquestador(c) } });
  const ids = await base.db.enTenant(A.id, async (uow) => {
    const campaignId = await uow.campanas.crear({ name: "Agencias", prompt: "Agencias de viajes", icp, meetingsGoal: 5 });
    const a = await uow.cuentas.insertar({
      campaignId,
      name: "Viajes Azahar",
      domain: "viajes-azahar.example",
      city: "Valencia",
      fitScore: 80,
      fitReasoning: "Encaja",
      fitEvidence: [],
      trigger: null,
      status: "found",
      source: "manual",
      discardReason: null,
    });
    return { campaignId, accountId: a?.id ?? "" };
  });
  await conTenant(A.id, () => base.db.enTenant(A.id, (uow) => aprobarCuentas(uow, servicios, ids.campaignId, [ids.accountId])));
  assert.equal(guion.peticiones.length, 2);
  assert.match(guion.peticiones[1]?.mensajes[0]?.texto ?? "", /"menu": \[\s*"planificar_secuencia",\s*"descartar",\s*"escalar_a_humano"\s*\]/);

  const [prospect] = await base.db.enTenantSql(A.id, (tx) => tx.query<{ id: string; stage: string }>("select id, stage from prospects"));
  assert.equal(prospect?.stage, "enriched");
  const eventos = await base.db.enTenant(A.id, (uow) => uow.eventos.deProspect(prospect?.id ?? ""));
  const rechazo = eventos.find((e) => e.type === "rejected");
  assert.equal(rechazo?.agent, "orchestrator");
  assert.match(rechazo?.summary ?? "", /Propuesta rechazada por el motor: «cambiar_rama» no está permitida/);
  assert.equal(rechazo?.reasoning, "Hay señal.");
  const escalado = eventos.at(-1);
  assert.equal(escalado?.type, "decision");
  assert.match(escalado?.summary ?? "", /^Lo deja en tus manos/);
  // Ni secuencia ni pasos: nada se ejecuta sin que una persona decida.
  assert.equal((await base.db.enTenant(A.id, (uow) => uow.prospects.pasos(prospect?.id ?? ""))).length, 0);
  // Las dos llamadas cuentan en el tope del tenant de ese día.
  const [uso] = await base.db.enTenantSql(A.id, (tx) => tx.query<{ calls: number }>("select calls from ai_usage where day = '2026-11-02'"));
  assert.equal(uso?.calls, 2);
});

test("motor: sin borrador válido el paso queda bloqueado con el motivo y no se vuelve a decidir", async () => {
  await sembrarTenant(base.admin, B);
  const semilla = await sembrarMotor(base.admin, B.id, "brisa.example");
  const redactor = new DeterministicDraftWriter();
  redactor.redactarPaso = async () => Promise.reject(new IaNoDisponible("salida_invalida", "La IA no ha devuelto una propuesta válida (no es JSON)."));
  // Que las reglas dejen pasar el paso hasta la redacción: email verificado y sin lista blanca.
  await base.admin.enTenantSql(B.id, (tx) => tx.query("update contacts set email_verified = true where tenant_id = :t", { t: B.id }));
  const { servicios } = serviciosDePrueba({ agentes: { redactor }, lista: null });
  const paso = await base.db.enTenant(B.id, (uow) => uow.prospects.paso(semilla.step));
  assert.ok(paso);
  await conTenant(B.id, () => base.db.enTenant(B.id, (uow) => procesarPaso(uow, servicios, paso)));
  const despues = await base.db.enTenant(B.id, (uow) => uow.prospects.paso(semilla.step));
  assert.equal(despues?.status, "blocked");
  assert.match(despues?.error ?? "", /no es JSON/);
  const ultimo = (await base.db.enTenant(B.id, (uow) => uow.eventos.deProspect(semilla.prospect))).at(-1);
  assert.equal(ultimo?.type, "blocked");
  assert.match(ultimo?.summary ?? "", /No hay borrador de «Primer contacto»: queda en tus manos/);
});
