import type { BuyingSignal, Evidence, Icp, ProspectStage, ReplyIntent } from "@jano/domain";
import { IcpSchema } from "@jano/domain";

import type {
  AccountScorer,
  Agentes,
  ContactResolver,
  ContextoOrquestador,
  DraftWriter,
  IcpStructurer,
  PlanificadorOrquestador,
  PropuestaIcp,
  PropuestaOrquestador,
  ReplyClassifier,
  ResumenCampana,
  RevisionCampana,
} from "../../ports/ia";
import { enMadrid, huella, normalizar } from "./texto";

/**
 * Agentes deterministas (spec 008 FR-010): reglas de palabras clave en lugar de
 * un modelo. Sirven para tests, CI y dev sin Bedrock; devuelven lo mismo que
 * devolverá Bedrock (propuestas con razonamiento y evidencia) y nunca inventan
 * datos que no estén en la entrada.
 */

const SECTORES: readonly (readonly [clave: string, sector: string, cnae: string])[] = [
  ["agencias de viajes", "Agencias de viajes", "7911"],
  ["agencia de viajes", "Agencias de viajes", "7911"],
  ["clinicas dentales", "Clínicas dentales", "8623"],
  ["despachos de abogados", "Despachos de abogados", "6910"],
  ["asesorias", "Asesorías", "6920"],
  ["ingenierias", "Ingenierías", "7112"],
  ["hoteles", "Hoteles", "5510"],
];

/** Comunidades y provincias que se reconocen en una frase. */
const REGIONES = [
  "Andalucía", "Aragón", "Asturias", "Illes Balears", "Canarias", "Cantabria", "Castilla y León",
  "Castilla-La Mancha", "Cataluña", "Comunitat Valenciana", "Extremadura", "Galicia", "Comunidad de Madrid",
  "Región de Murcia", "Navarra", "País Vasco", "La Rioja", "Valencia", "Alicante", "Castellón", "Madrid",
  "Barcelona", "Sevilla", "Málaga", "Murcia", "Zaragoza", "Bizkaia", "Granada", "Córdoba", "Cádiz",
] as const;

const SENALES: readonly (readonly [RegExp, BuyingSignal])[] = [
  [/vacante|contratando|buscan? (un |una )?(responsable )?comercial/, "vacante_comercial"],
  [/nueva oficina|apertura|abren/, "nueva_oficina"],
  [/web (nueva|renovada)|renuevan? (la|su) web/, "web_renovada"],
  [/nuevo (administrador|gerente)|cambio de administrador/, "cambio_administrador"],
  [/ronda|financiacion|inversion/, "ronda_financiacion"],
  [/nuevo producto|lanzamiento/, "nuevo_producto"],
];

function regionesEn(texto: string): string[] {
  const t = normalizar(texto);
  const halladas = REGIONES.filter((r) => t.includes(normalizar(r)));
  // «Comunitat Valenciana» contiene «Valencia»: se queda la más larga.
  return halladas.filter((r) => !halladas.some((o) => o !== r && normalizar(o).includes(normalizar(r))));
}

function cambiosEn(texto: string): Partial<Icp> {
  const t = normalizar(texto);
  const cambios: { -readonly [K in keyof Icp]?: Icp[K] } = {};
  const sector = SECTORES.find(([clave]) => t.includes(clave));
  if (sector) {
    cambios.sector = sector[1];
    cambios.cnae = [sector[2]];
  }
  const factura = /factur\w*[^\d]{0,30}(\d+(?:[.,]\d+)?)\s*(m€|m |millones|mill)/.exec(`${t} `);
  if (factura?.[1]) cambios.revenueMinEur = Math.round(Number(factura[1].replace(",", ".")) * 1_000_000);
  const empleados = /(\d+)\s*(?:o mas\s*)?(?:empleados|trabajadores|personas)/.exec(t);
  if (empleados?.[1]) cambios.employeesMin = Number(empleados[1]);
  const senales = SENALES.filter(([re]) => re.test(t)).map(([, s]) => s);
  if (senales.length) cambios.signals = senales;
  return cambios;
}

function sugerencias(icp: Icp): string[] {
  const s: string[] = [];
  if (!icp.regions.length) s.push("Indica una región para buscar candidatas");
  if (icp.revenueMinEur === null) s.push("Añade un mínimo de facturación");
  if (!icp.signals.length) s.push("Prioriza cuentas con vacante comercial");
  return s;
}

export class DeterministicIcpStructurer implements IcpStructurer {
  async estructurar(frase: string) {
    const cambios = cambiosEn(frase);
    const primeraParte = frase.split(/,| en | con | de más| que /i)[0]?.trim() || frase.trim();
    const icp = IcpSchema.parse({
      sector: cambios.sector ?? primeraParte.slice(0, 80),
      cnae: cambios.cnae ?? [],
      country: "ES",
      regions: regionesEn(frase),
      revenueMinEur: cambios.revenueMinEur ?? null,
      revenueMaxEur: null,
      employeesMin: cambios.employeesMin ?? null,
      signals: cambios.signals ?? [],
      exclusions: [],
    });
    const nombre = `${icp.sector} · ${icp.regions.join(", ") || "España"}`.slice(0, 160);
    return {
      nombre,
      icp,
      texto: "He estructurado el ICP a partir de tu frase; revísalo antes de que busque cuentas.",
      sugerencias: sugerencias(icp),
    };
  }

  async afinar(actual: Icp, instruccion: string): Promise<PropuestaIcp> {
    const t = normalizar(instruccion);
    const regiones = regionesEn(instruccion);
    const quitar = /\b(quita|elimina|sin|excluye|menos)\b/.test(t);
    const cambios = cambiosEn(instruccion);
    let regions = [...actual.regions];
    if (regiones.length) {
      regions = quitar ? regions.filter((r) => !regiones.includes(r)) : [...new Set([...regions, ...regiones])];
    }
    const exclusiones = !regiones.length && quitar ? [instruccion.replace(/^\s*\S+\s*/, "").trim()].filter(Boolean) : [];
    const icp = IcpSchema.parse({ ...actual, ...cambios, regions, exclusions: [...actual.exclusions, ...exclusiones] });
    const hecho = JSON.stringify(icp) !== JSON.stringify(actual);
    return {
      icp,
      texto: hecho ? `Aplicado: «${instruccion.trim()}». El resto del ICP no cambia.` : "No he encontrado qué cambiar; dime la región, la facturación o la señal.",
      sugerencias: sugerencias(icp),
    };
  }
}

export class DeterministicAccountScorer implements AccountScorer {
  async puntuar({ icp, empresa, paginas }: Parameters<AccountScorer["puntuar"]>[0]) {
    const texto = normalizar(paginas.map((p) => p.texto).join(" "));
    const sector = normalizar(icp.sector);
    const encajaSector = sector.split(/\s+/).some((w) => w.length > 4 && texto.includes(w.slice(0, -1)));
    const fitScore = Math.min(100, 35 + (huella(empresa.dominio) % 45) + (encajaSector ? 20 : 0));
    const portada = paginas[0];
    const evidencia: Evidence[] = portada
      ? [{ source: "web", summary: portada.texto.slice(0, 160), url: portada.url, observedAt: portada.leidaEn }]
      : [];
    const conVacante = paginas.find((p) => /responsable comercial|vacante/.test(normalizar(p.texto)));
    return {
      fitScore,
      razonamiento: `${encajaSector ? `Su web habla de ${icp.sector.toLowerCase()}` : "Su web no deja claro el sector"}. Facturación sin dato registral: no se estima.`,
      evidencia,
      senal: conVacante
        ? {
            signal: "vacante_comercial" as const,
            summary: "Publica una vacante de responsable comercial",
            evidence: { source: "web" as const, summary: conVacante.texto.slice(0, 160), url: conVacante.url, observedAt: conVacante.leidaEn },
          }
        : null,
    };
  }
}

export class DeterministicContactResolver implements ContactResolver {
  async proponer({ cuenta }: Parameters<ContactResolver["proponer"]>[0]) {
    const comercial = cuenta.trigger?.signal === "vacante_comercial";
    return {
      cargo: comercial ? "Dirección comercial" : "Gerencia",
      motivo: comercial
        ? "Están contratando en comercial: quien dirige el área decide sobre la prospección."
        : "En una empresa de este tamaño la gerencia decide sobre la captación de clientes.",
      evidencia: cuenta.fitEvidence.map((e) => e.url ?? e.summary).slice(0, 2),
    };
  }
}

const INICIO_TONO = {
  mas_breve: "Te lo resumo: ",
  mas_formal: "Le agradezco la respuesta. ",
  mas_cercano: "¡Gracias por contestar! ",
  otra_propuesta: "Te propongo otra cosa: ",
} as const;

export class DeterministicDraftWriter implements DraftWriter {
  async redactarPaso({ cuenta, contacto, paso }: Parameters<DraftWriter["redactarPaso"]>[0]) {
    return {
      asunto: `${paso.titulo} · ${cuenta.name}`,
      cuerpo: `Hola:\n\nEscribo a ${contacto.cargo.toLowerCase()} de ${cuenta.name}. ${paso.intencion}.\n\n¿Lo hablamos 20 minutos?`,
      razonamiento: `Paso del día ${paso.dia} de la rama ${paso.rama}: ${paso.intencion.toLowerCase()}.`,
    };
  }

  async redactarRespuesta({ cuenta, intent, huecos, tono }: Parameters<DraftWriter["redactarRespuesta"]>[0]) {
    const inicio = tono ? INICIO_TONO[tono] : "";
    const cuerpo: Record<ReplyIntent, string> = {
      interest: `Gracias por la respuesta. Te propongo dos huecos: ${huecos.map((h) => enMadrid(h.start)).join(" o ")}. Te envío la invitación con el que elijas.`,
      objection: "Entiendo la duda. Te cuento en dos líneas cómo lo resuelven agencias de vuestro tamaño, sin compromiso.",
      not_now: "Perfecto, lo dejamos para más adelante. Te escribo dentro de unos meses.",
      out_of_office: "Gracias, te escribo a la vuelta.",
      opt_out: "Hecho: no volverás a recibir correos nuestros.",
      wrong_person: "Gracias por avisar. ¿Me indicas quién lleva la captación de clientes en vuestra empresa?",
      other: "Gracias por la respuesta. ¿Te parece si lo hablamos 20 minutos?",
    };
    return {
      asunto: `Re: ${cuenta.name}`,
      cuerpo: `${inicio}${cuerpo[intent]}`,
      confianza: intent === "interest" ? ("alta" as const) : intent === "other" ? ("baja" as const) : ("media" as const),
    };
  }
}

const INTENCIONES: readonly (readonly [RegExp, ReplyIntent, string])[] = [
  [/\bbaja\b|no me escrib|dejad de escribir|no quiero recibir/, "opt_out", "Pide no recibir más correos."],
  [/fuera de la oficina|de vacaciones|respuesta automatica/, "out_of_office", "Respuesta automática de ausencia."],
  [/no soy (yo|la persona)|no es mi area|no llevo/, "wrong_person", "Dice que no es la persona adecuada."],
  [/mas adelante|ahora no|el ano que viene|despues de/, "not_now", "Interés aplazado: pide retomarlo más adelante."],
  [/precio|caro|presupuesto|ya tenemos/, "objection", "Plantea una objeción de precio o de proveedor."],
  [/interes|reunion|hablamos|llamada|cuentame|me encaja/, "interest", "Pide saber más o propone hablar: intención alta."],
];

export class DeterministicReplyClassifier implements ReplyClassifier {
  async clasificar({ texto }: { texto: string }) {
    const t = normalizar(texto);
    const hallada = INTENCIONES.find(([re]) => re.test(t));
    return hallada ? { intent: hallada[1], razonamiento: hallada[2] } : { intent: "other" as const, razonamiento: "No encaja en ninguna intención clara." };
  }
}

/**
 * Orquestador determinista: las mismas decisiones que tomaría el motor solo con
 * reglas. Señal con fecha y al menos un envío en la consultiva: cambiar de rama;
 * paso vencido: pedir el borrador; ausencia: esperar una semana; lo demás, a la
 * persona.
 */
export class DeterministicPlanificadorOrquestador implements PlanificadorOrquestador {
  async proponerSiguienteAccion(c: ContextoOrquestador): Promise<PropuestaOrquestador> {
    const puede = (t: ContextoOrquestador["menu"][number]) => c.menu.includes(t);
    const evidenciaCuenta = c.cuenta.fitEvidence.map((e) => e.url ?? e.summary).slice(0, 2);

    if (c.punto === "cuenta_aprobada" && puede("planificar_secuencia")) {
      return c.cuenta.trigger
        ? {
            accion: { tipo: "planificar_secuencia", kind: "trigger" },
            razonamiento: `Hay una señal de compra con fecha (${c.cuenta.trigger.summary.toLowerCase()}): un mensaje ligado a ella encaja mejor.`,
            evidencia: [c.cuenta.trigger.evidence.url ?? c.cuenta.trigger.summary],
          }
        : {
            accion: { tipo: "planificar_secuencia", kind: "consultiva" },
            razonamiento: "Sin señal de compra en su web: la rama consultiva deja espacio para que aparezca una.",
            evidencia: evidenciaCuenta,
          };
    }

    if (c.punto === "paso_vencido" || c.punto === "senal_nueva") {
      if (c.rama === "consultiva" && !c.cambiadaDe && c.cuenta.trigger && c.enviados >= 1 && puede("cambiar_rama")) {
        return {
          accion: { tipo: "cambiar_rama", to: "trigger" },
          razonamiento: `${c.cuenta.trigger.summary}: la prospección es prioridad ahora. Un mensaje ligado a esa señal encaja mejor que el siguiente paso consultivo.`,
          evidencia: [c.cuenta.trigger.evidence.url ?? c.cuenta.trigger.summary, `${c.enviados} correo(s) enviados sin respuesta`],
        };
      }
      if (c.paso && puede("pedir_borrador")) {
        return {
          accion: { tipo: "pedir_borrador", stepId: c.paso.id },
          razonamiento: `Toca el paso del día ${c.paso.dia} («${c.paso.titulo}»): Outreach lo redacta y queda pendiente de tu OK.`,
          evidencia: evidenciaCuenta,
        };
      }
    }

    if (c.punto === "respuesta_clasificada" && c.intent === "out_of_office" && puede("esperar_hasta")) {
      const at = new Date(Date.parse(c.ahora) + 7 * c.minutosPorDia * 60_000).toISOString();
      return {
        accion: { tipo: "esperar_hasta", at },
        razonamiento: "Es una respuesta automática de ausencia: conviene retomar a la vuelta, en una semana.",
        evidencia: [],
      };
    }

    return {
      accion: { tipo: "escalar_a_humano", motivo: c.punto === "respuesta_clasificada" ? "Hay un borrador de respuesta que revisar." : "No hay una acción clara." },
      razonamiento: "La decisión corresponde a una persona.",
      evidencia: [],
    };
  }

  async revisarCampana(r: ResumenCampana): Promise<RevisionCampana> {
    const etapas: readonly ProspectStage[] = ["found", "enriched", "in_sequence", "waiting", "replied"];
    let cuello: ProspectStage | null = null;
    for (const e of etapas) if ((r.actuales[e] ?? 0) > (cuello ? (r.actuales[cuello] ?? 0) : 0)) cuello = e;
    if (!cuello) {
      return { lectura: r.cuentasEncontradas ? `${r.cuentasEncontradas} cuentas encontradas esperan tu revisión.` : "La campaña aún no tiene prospects.", cuello: null, propuesta: null };
    }
    const n = r.actuales[cuello] ?? 0;
    const porEtapa: Record<string, { lectura: string; texto: string; efecto: string }> = {
      found: { lectura: `${n} prospects esperan contacto.`, texto: "Revisar las cuentas aprobadas", efecto: "El Contact Finder empieza con ellas" },
      enriched: { lectura: `${n} prospects tienen contacto pero no secuencia.`, texto: "Planificar sus secuencias", efecto: "Primeros correos hoy" },
      in_sequence: r.aplazadosHoy
        ? { lectura: `El cuello de botella está en Outreach: ${r.aplazadosHoy} envíos aplazados hoy por el límite del buzón.`, texto: "Añadir un segundo buzón", efecto: "Cola vacía antes" }
        : { lectura: `El cuello de botella está en Outreach: ${n} prospects en secuencia.`, texto: "Aprobar los borradores pendientes", efecto: "Los envíos salen hoy" },
      waiting: { lectura: `${n} prospects esperan por el límite de envío.`, texto: "Añadir un segundo buzón", efecto: "Cola vacía antes" },
      replied: { lectura: `${n} respuestas esperan contestación.`, texto: "Revisar la bandeja", efecto: "Reuniones antes" },
    };
    const p = porEtapa[cuello] ?? { lectura: `${n} prospects en ${cuello}.`, texto: "Revisar la campaña", efecto: "" };
    return { lectura: p.lectura, cuello, propuesta: { texto: p.texto, efecto: p.efecto } };
  }
}

export function agentesDeterministas(): Agentes {
  return {
    orquestador: new DeterministicPlanificadorOrquestador(),
    icp: new DeterministicIcpStructurer(),
    cuentas: new DeterministicAccountScorer(),
    contactos: new DeterministicContactResolver(),
    redactor: new DeterministicDraftWriter(),
    respuestas: new DeterministicReplyClassifier(),
  };
}
