// Prueba manual de los agentes contra Bedrock (spec 008 T022, SC-004).
//   AWS_PROFILE=fintrack-dev pnpm --filter @jano/backend probar-agentes
//   AWS_PROFILE=fintrack-dev pnpm --filter @jano/backend probar-agentes --cuentas 3 --region "Comunitat Valenciana"
//
// Toma agencias de viajes reales de OpenStreetMap en la región, lee su web con el
// LectorWeb (páginas elegidas por el modelo) y pasa cada una por el Account Finder,
// el Contact Finder, el Orquestador y Outreach; después, una vez, el ICP, Response y
// la lectura de la campaña. Cada salida ya viene validada por los adaptadores; aquí
// se imprime recortada con su coste. No escribe en ninguna base de datos ni envía
// nada: el tope diario va en memoria y el tenant es de prueba.
import { parseArgs } from "node:util";

import { type Account, AccountSchema } from "@jano/domain";

import { agentesBedrock } from "../src/adapters/bedrock/agentes";
import { BedrockConversador, ClienteModelo, MODELO_POR_DEFECTO, type TopeDeLlamadas } from "../src/adapters/bedrock/modelo";
import { relojDelSistema } from "../src/adapters/deterministas/reloj";
import { LectorWeb } from "../src/adapters/web/lector";
import { OsmCompanySource } from "../src/adapters/web/osm";
import { conTenant } from "../src/application/contexto-tenant";
import { proponerHuecos } from "../src/domain/motor/huecos";
import { menuDeAcciones } from "../src/domain/motor/orquestador";

const { values } = parseArgs({
  options: {
    cuentas: { type: "string", default: "3" },
    region: { type: "string", default: "Comunitat Valenciana" },
    intentos: { type: "string", default: "10" },
  },
});
process.env["AWS_REGION"] ??= "eu-west-1";
const objetivo = Number(values.cuentas);
const TENANT = "tenant-prueba-agentes";

// ── Registro de llamadas: coste y tokens por agente y por cuenta ──────────
interface Llamada {
  readonly agente: string;
  readonly prompt: string;
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
  readonly costeUsd: number;
  readonly latenciaMs: number;
  readonly valida: boolean;
  readonly etiqueta: string;
}
const llamadas: Llamada[] = [];
let etiqueta = "";
const registrar = (l: Record<string, unknown>) => {
  if (l["msg"] === "ia_llamada") {
    llamadas.push({
      agente: String(l["agente"]),
      prompt: String(l["prompt"]),
      tokensEntrada: Number(l["tokens_entrada"]),
      tokensSalida: Number(l["tokens_salida"]),
      costeUsd: Number(l["coste_usd"]),
      latenciaMs: Number(l["latencia_ms"]),
      valida: l["valida"] === true,
      etiqueta,
    });
  } else {
    console.log(`  · ${JSON.stringify(l)}`);
  }
};

const topeEnMemoria: TopeDeLlamadas = { reservar: async () => true, anotar: async () => {} };
const modelo = new ClienteModelo({
  conversador: new BedrockConversador(process.env["BEDROCK_MODEL_ID"] || MODELO_POR_DEFECTO),
  tope: topeEnMemoria,
  tenant: () => TENANT,
  reloj: relojDelSistema,
  registrar,
});
const agentes = agentesBedrock(modelo);
const lector = new LectorWeb({ reloj: relojDelSistema, enlaces: agentes.enlaces });

const recorta = (t: string, n = 220) => (t.length > n ? `${t.slice(0, n)}…` : t);
const sumar = (ls: readonly Llamada[]) => ({
  llamadas: ls.length,
  tokensEntrada: ls.reduce((a, l) => a + l.tokensEntrada, 0),
  tokensSalida: ls.reduce((a, l) => a + l.tokensSalida, 0),
  costeUsd: Number(ls.reduce((a, l) => a + l.costeUsd, 0).toFixed(5)),
});

await conTenant(TENANT, async () => {
  console.log(`Modelo: ${modelo.modelo} · región ${process.env["AWS_REGION"]}\n`);

  etiqueta = "campana";
  const campana = await agentes.icp.estructurar(`Agencias de viajes en la ${values.region} que organicen viajes de empresa`);
  console.log("ICP:", JSON.stringify({ nombre: campana.nombre, icp: campana.icp, texto: campana.texto }));
  const afinado = await agentes.icp.afinar(campana.icp, "Prioriza las que tengan una vacante comercial");
  console.log("ICP afinado:", JSON.stringify({ signals: afinado.icp.signals, regions: afinado.icp.regions, texto: afinado.texto }), "\n");

  const osm = new OsmCompanySource();
  const candidatas = await osm.buscar(values.region, 200);
  console.log(`OpenStreetMap: ${candidatas.length} agencias con web propia en ${values.region} (${osm.atribucion})\n`);

  let analizadas = 0;
  for (const empresa of candidatas.slice(0, Number(values.intentos))) {
    if (analizadas >= objetivo) break;
    etiqueta = `cuenta:${empresa.dominio}`;
    const inicio = Date.now();
    const lectura = await lector.leer(empresa.dominio);
    if (!lectura.ok) {
      console.log(`— ${empresa.nombre} (${empresa.dominio}, ${empresa.origen}): descartada, ${lectura.motivo}\n`);
      continue;
    }
    const p = await agentes.cuentas.puntuar({ icp: afinado.icp, empresa, paginas: lectura.paginas });
    analizadas++;
    console.log(`— ${empresa.nombre} (${empresa.dominio}, ${empresa.origen}) · ${Math.round((Date.now() - inicio) / 1000)} s`);
    console.log(`  páginas: ${lectura.paginas.map((x) => new URL(x.url).pathname).join(", ")}`);
    console.log(`  fit ${p.fitScore}: ${recorta(p.razonamiento)}`);
    for (const e of p.evidencia) console.log(`  evidencia: ${e.url} · ${recorta(e.summary, 120)}`);
    console.log(`  señal: ${p.senal ? `${p.senal.signal} · ${p.senal.summary}` : "ninguna"}`);

    const cuenta: Account = AccountSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      campaignId: "22222222-2222-4222-8222-222222222222",
      name: empresa.nombre,
      domain: empresa.dominio,
      city: empresa.ciudad,
      cnae: null,
      revenueEur: null,
      employees: null,
      fitScore: p.fitScore,
      fitReasoning: p.razonamiento,
      fitEvidence: p.evidencia,
      trigger: p.senal,
      status: "approved",
      createdAt: new Date().toISOString(),
    });
    etiqueta = `prospect:${empresa.dominio}`;
    const contacto = await agentes.contactos.proponer({ cuenta });
    console.log(`  contacto: ${contacto.cargo} · ${recorta(contacto.motivo, 160)}`);
    const decision = await agentes.orquestador.proponerSiguienteAccion({
      punto: "cuenta_aprobada",
      ahora: new Date().toISOString(),
      minutosPorDia: 1440,
      etapa: "enriched",
      rama: null,
      cambiadaDe: null,
      cuenta,
      paso: null,
      enviados: 0,
      intent: null,
      menu: menuDeAcciones("enriched", "cuenta_aprobada", false),
    });
    console.log(`  orquestador: ${JSON.stringify(decision.accion)} · ${recorta(decision.razonamiento, 160)}`);
    // Como en el motor: sin secuencia planificada no hay paso que redactar.
    if (decision.accion.tipo !== "planificar_secuencia") {
      console.log(`  cuenta: ${JSON.stringify(sumar(llamadas.filter((l) => l.etiqueta === `cuenta:${empresa.dominio}`)))}`);
      console.log(`  prospect: ${JSON.stringify(sumar(llamadas.filter((l) => l.etiqueta === `prospect:${empresa.dominio}`)))}\n`);
      continue;
    }
    const rama = decision.accion.kind;
    const borrador = await agentes.redactor.redactarPaso({
      cuenta,
      contacto: { nombre: `${contacto.cargo} (prueba)`, cargo: contacto.cargo },
      paso: rama === "trigger"
        ? { titulo: "Email por señal de compra", intencion: "Relacionar la señal con la carga de prospección", dia: 0, rama }
        : { titulo: "Email personalizado", intencion: "Presentarse con algo concreto de su web", dia: 0, rama },
    });
    console.log(`  borrador (${borrador.cuerpo.split(/\s+/).length} palabras): «${borrador.asunto}»`);
    console.log(`    ${borrador.cuerpo.replace(/\n+/g, "\n    ")}`);
    console.log(`  cuenta: ${JSON.stringify(sumar(llamadas.filter((l) => l.etiqueta === `cuenta:${empresa.dominio}`)))}`);
    console.log(`  prospect: ${JSON.stringify(sumar(llamadas.filter((l) => l.etiqueta === `prospect:${empresa.dominio}`)))}\n`);
  }

  etiqueta = "respuesta";
  const respuesta = "Hola, nos interesa. ¿Podemos hablar la semana que viene? Llamadme al 600 111 222. Un saludo.";
  const intencion = await agentes.respuestas.clasificar({ texto: respuesta });
  console.log("Response:", JSON.stringify(intencion));
  const huecos = proponerHuecos(new Date());
  const contestacion = await agentes.redactor.redactarRespuesta({
    cuenta: AccountSchema.parse({ id: "11111111-1111-4111-8111-111111111111", campaignId: "22222222-2222-4222-8222-222222222222", name: "Agencia de prueba", domain: "agencia.example", city: null, cnae: null, revenueEur: null, employees: null, fitScore: 80, fitReasoning: "x", fitEvidence: [], trigger: null, status: "contacted", createdAt: new Date().toISOString() }),
    contacto: { nombre: "Gerencia (prueba)", cargo: "Gerencia" },
    respuesta,
    intent: intencion.intent,
    huecos,
    tono: null,
  });
  console.log(`Contestación «${contestacion.asunto}» (${contestacion.confianza}):\n  ${contestacion.cuerpo.replace(/\n+/g, "\n  ")}`);
  etiqueta = "campana";
  const lectura = await agentes.orquestador.revisarCampana({ campaignName: campana.nombre, actuales: { found: 12, enriched: 3, in_sequence: 5 }, cuentasEncontradas: 30, aplazadosHoy: 0 });
  console.log("Lectura de Jano:", JSON.stringify(lectura), "\n");
});

// ── Resumen de coste (SC-004) ─────────────────────────────────────────────
const porAgente = new Map<string, Llamada[]>();
for (const l of llamadas) porAgente.set(l.prompt, [...(porAgente.get(l.prompt) ?? []), l]);
console.log("Coste por prompt:");
for (const [p, ls] of porAgente) console.log(`  ${p}: ${JSON.stringify({ ...sumar(ls), latenciaMediaMs: Math.round(ls.reduce((a, l) => a + l.latenciaMs, 0) / ls.length), invalidas: ls.filter((l) => !l.valida).length })}`);
const cuentas = llamadas.filter((l) => l.etiqueta.startsWith("cuenta:"));
const prospects = llamadas.filter((l) => l.etiqueta.startsWith("prospect:"));
const n = new Set(cuentas.map((l) => l.etiqueta)).size || 1;
console.log(`Total: ${JSON.stringify(sumar(llamadas))}`);
console.log(`Media por cuenta analizada (selector de páginas + puntuación, ${n}): ${(sumar(cuentas).costeUsd / n).toFixed(5)} USD`);
console.log(`Media por prospect (contacto + orquestador + primer borrador, ${n}): ${(sumar(prospects).costeUsd / n).toFixed(5)} USD`);
