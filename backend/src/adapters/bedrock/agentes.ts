import {
  type Account,
  BuyingSignalSchema,
  type Evidence,
  type Icp,
  IcpSchema,
  ProspectStageSchema,
  ReplyIntentSchema,
  type Trigger,
} from "@jano/domain";
import { z } from "zod";

import { PropuestaOrquestadorSchema } from "../../domain/motor/orquestador";
import { limpiarPii } from "../../domain/pii";
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
  Puntuacion,
  ReplyClassifier,
  ResumenCampana,
  RevisionCampana,
  SelectorDeEnlaces,
} from "../../ports/ia";
import { enMadrid } from "../deterministas/texto";
import type { ClienteModelo } from "./modelo";
import { prompt } from "./prompts";

/**
 * Agentes sobre Bedrock (spec 008 FR-010, FR-015, FR-017). Cada uno arma su
 * entrada, pide al modelo una salida con su esquema y comprueba lo que zod no
 * puede: que las URLs citadas sean las leídas, que un borrador quepa en 120
 * palabras y no prometa precios, que el contacto sea un cargo y no una persona.
 * Una salida que no pasa se reintenta una vez (`ClienteModelo`). Lo que devuelven
 * es una propuesta: la valida y la ejecuta el motor.
 */

const texto = (max: number) => z.string().trim().min(1).max(max);

// ── Comprobaciones de los textos que salen hacia una persona ─────────────

const MAX_PALABRAS = 120;
const PRECIO = /\d[\d.,]*\s?(?:€|euros?\b|eur\b)|€\s?\d/i;
const PLAZO = /\bgarantiz\w*|\bplazo de entrega\b|\ben (?:menos de )?\d+ (?:horas|d[ií]as|semanas)\b/i;
const PIE = /\bdar(?:te|se|le)? de baja\b|\bunsubscribe\b|darse de baja|aviso legal/i;
const MARCADOR = /\[(?:EMAIL|TELÉFONO|NIF|IBAN)\]/;

export const palabras = (t: string): number => t.split(/\s+/).filter(Boolean).length;

/** Lo que no puede llevar un correo que redacta un agente (spec 004 US4). */
export function revisarCorreo(cuerpo: string, asunto: string): string | null {
  if (palabras(cuerpo) > MAX_PALABRAS) return `el cuerpo tiene ${palabras(cuerpo)} palabras y el máximo es ${MAX_PALABRAS}`;
  const todo = `${asunto}\n${cuerpo}`;
  if (PRECIO.test(todo)) return "menciona un precio o un importe";
  if (PLAZO.test(todo)) return "promete un plazo o una garantía";
  if (PIE.test(todo)) return "incluye el pie o la baja, que añade el sistema";
  if (MARCADOR.test(todo)) return "copia un marcador de datos personales";
  return null;
}

const resumenCuenta = (c: Account) => ({
  nombre: c.name,
  dominio: c.domain,
  ciudad: c.city,
  razonamiento: c.fitReasoning,
  evidencias: c.fitEvidence.map((e) => ({ url: e.url, resumen: e.summary })),
  senal: c.trigger && { tipo: c.trigger.signal, resumen: c.trigger.summary },
});

// ── Orquestador: ICP ─────────────────────────────────────────────────────

const PropuestaIcpSchema = z.object({ icp: IcpSchema, texto: texto(600), sugerencias: z.array(texto(160)).max(4) });

export class BedrockIcpStructurer implements IcpStructurer {
  constructor(private readonly modelo: ClienteModelo) {}

  estructurar(frase: string) {
    return this.modelo.pedir({
      agente: "orchestrator",
      prompt: prompt("icp-estructurar"),
      entrada: { frase },
      esquema: PropuestaIcpSchema.extend({ nombre: texto(160) }),
      maxTokens: 1200,
    });
  }

  afinar(actual: Icp, instruccion: string): Promise<PropuestaIcp> {
    return this.modelo.pedir({
      agente: "orchestrator",
      prompt: prompt("icp-afinar"),
      entrada: { icpActual: actual, instruccion },
      esquema: PropuestaIcpSchema,
      maxTokens: 1200,
    });
  }
}

// ── Account Finder ──────────────────────────────────────────────────────

export class BedrockSelectorDeEnlaces implements SelectorDeEnlaces {
  constructor(private readonly modelo: ClienteModelo) {}

  async elegir({ dominio, portada, enlaces, maximo }: Parameters<SelectorDeEnlaces["elegir"]>[0]) {
    const urls = new Set(enlaces.map((e) => e.url));
    const r = await this.modelo.pedir({
      agente: "account_finder",
      prompt: prompt("enlaces"),
      entrada: { dominio, portada: { titulo: portada.titulo, texto: portada.texto.slice(0, 1500) }, enlaces, maximo },
      esquema: z.object({ enlaces: z.array(z.object({ url: z.string(), motivo: texto(200) })).max(maximo) }),
      comprobar: (s) => (s.enlaces.every((e) => urls.has(e.url)) ? null : "elige solo URLs de la lista de enlaces"),
      maxTokens: 400,
    });
    return r.enlaces.map((e) => e.url);
  }
}

const PuntuacionSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  razonamiento: texto(600),
  evidencias: z.array(z.object({ url: z.string(), cita: texto(300) })).min(1).max(4),
  senal: z.object({ tipo: BuyingSignalSchema, resumen: texto(200), url: z.string(), fecha: texto(60) }).nullable(),
});

export class BedrockAccountScorer implements AccountScorer {
  constructor(private readonly modelo: ClienteModelo) {}

  async puntuar({ icp, empresa, paginas }: Parameters<AccountScorer["puntuar"]>[0]): Promise<Puntuacion> {
    const leidas = new Map(paginas.map((p) => [p.url, p]));
    const r = await this.modelo.pedir({
      agente: "account_finder",
      prompt: prompt("cuentas"),
      entrada: {
        icp,
        empresa: { nombre: empresa.nombre, dominio: empresa.dominio, ciudad: empresa.ciudad },
        paginas: paginas.map((p) => ({ url: p.url, titulo: p.titulo, texto: p.texto })),
      },
      esquema: PuntuacionSchema,
      comprobar: (s) => {
        if (!s.evidencias.every((e) => leidas.has(e.url))) return "cada evidencia tiene que citar la URL de una de las páginas recibidas";
        if (s.senal && !leidas.has(s.senal.url)) return "la señal tiene que citar la URL de una de las páginas recibidas";
        return null;
      },
      maxTokens: 900,
    });
    const evidencia = (url: string, summary: string): Evidence => ({ source: "web", summary, url, observedAt: leidas.get(url)?.leidaEn ?? new Date().toISOString() });
    const senal: Trigger | null = r.senal
      ? { signal: r.senal.tipo, summary: `${r.senal.resumen} (${r.senal.fecha})`, evidence: evidencia(r.senal.url, r.senal.resumen) }
      : null;
    return { fitScore: r.fitScore, razonamiento: r.razonamiento, evidencia: r.evidencias.map((e) => evidencia(e.url, e.cita)), senal };
  }
}

// ── Contact Finder ──────────────────────────────────────────────────────

export class BedrockContactResolver implements ContactResolver {
  constructor(private readonly modelo: ClienteModelo) {}

  proponer({ cuenta }: Parameters<ContactResolver["proponer"]>[0]) {
    return this.modelo.pedir({
      agente: "contact_finder",
      prompt: prompt("contactos"),
      entrada: { cuenta: resumenCuenta(cuenta) },
      esquema: z.object({ cargo: texto(80), motivo: texto(400), evidencia: z.array(texto(300)).max(3) }),
      // FR-015: un cargo, nunca una persona. Ni email, ni teléfono, ni cifras en el cargo.
      comprobar: (s) => {
        const limpio = limpiarPii(`${s.cargo} ${s.motivo}`);
        if (Object.keys(limpio.sustituciones).length || MARCADOR.test(`${s.cargo} ${s.motivo}`)) return "no incluyas emails, teléfonos ni documentos";
        if (/\d/.test(s.cargo)) return "el cargo no lleva cifras";
        return null;
      },
      maxTokens: 400,
    });
  }
}

// ── Outreach y redacción de Response ─────────────────────────────────────

const CorreoSchema = z.object({ asunto: texto(120), cuerpo: texto(1500) });

export class BedrockDraftWriter implements DraftWriter {
  constructor(private readonly modelo: ClienteModelo) {}

  redactarPaso({ cuenta, contacto, paso }: Parameters<DraftWriter["redactarPaso"]>[0]) {
    return this.modelo.pedir({
      agente: "outreach",
      prompt: prompt("redactar-paso"),
      entrada: { cuenta: resumenCuenta(cuenta), contacto: { cargo: contacto.cargo }, paso },
      esquema: CorreoSchema.extend({ razonamiento: texto(400) }),
      comprobar: (s) => revisarCorreo(s.cuerpo, s.asunto),
      maxTokens: 800,
    });
  }

  redactarRespuesta({ cuenta, contacto, respuesta, intent, huecos, tono }: Parameters<DraftWriter["redactarRespuesta"]>[0]) {
    const textosHuecos = huecos.map((h) => enMadrid(h.start));
    return this.modelo.pedir({
      agente: "response",
      prompt: prompt("redactar-respuesta"),
      entrada: { cuenta: { nombre: cuenta.name, dominio: cuenta.domain }, contacto: { cargo: contacto.cargo }, respuesta, intent, huecos: textosHuecos, tono },
      esquema: CorreoSchema.extend({ confianza: z.enum(["alta", "media", "baja"]) }),
      comprobar: (s) => {
        const fallo = revisarCorreo(s.cuerpo, s.asunto);
        if (fallo) return fallo;
        const falta = intent === "interest" ? textosHuecos.find((h) => !s.cuerpo.includes(h)) : undefined;
        return falta ? `copia literalmente el hueco «${falta}»` : null;
      },
      maxTokens: 800,
    });
  }
}

// ── Response: intención ──────────────────────────────────────────────────

export class BedrockReplyClassifier implements ReplyClassifier {
  constructor(private readonly modelo: ClienteModelo) {}

  clasificar({ texto: t }: { texto: string }) {
    return this.modelo.pedir({
      agente: "response",
      prompt: prompt("respuestas"),
      entrada: { texto: t.slice(0, 6000) },
      esquema: z.object({ intent: ReplyIntentSchema, razonamiento: texto(400) }),
      maxTokens: 300,
    });
  }
}

// ── Orquestador: planificación ───────────────────────────────────────────

export class BedrockPlanificadorOrquestador implements PlanificadorOrquestador {
  constructor(private readonly modelo: ClienteModelo) {}

  /**
   * Solo se valida la forma: si propone algo fuera del menú, se devuelve tal cual
   * y es el motor quien lo rechaza, lo registra y lo pasa a una persona (T022b).
   */
  async proponerSiguienteAccion(c: ContextoOrquestador): Promise<PropuestaOrquestador> {
    const r = await this.modelo.pedir({
      agente: "orchestrator",
      prompt: prompt("orquestador"),
      entrada: {
        punto: c.punto,
        ahora: c.ahora,
        minutosPorDia: c.minutosPorDia,
        etapa: c.etapa,
        rama: c.rama,
        cambiadaDe: c.cambiadaDe,
        cuenta: { nombre: c.cuenta.name, fitScore: c.cuenta.fitScore, razonamiento: c.cuenta.fitReasoning, senal: resumenCuenta(c.cuenta).senal },
        paso: c.paso,
        enviados: c.enviados,
        intent: c.intent,
        menu: c.menu,
      },
      esquema: PropuestaOrquestadorSchema,
      maxTokens: 500,
    });
    return r as PropuestaOrquestador;
  }

  revisarCampana(resumen: ResumenCampana): Promise<RevisionCampana> {
    return this.modelo.pedir({
      agente: "orchestrator",
      prompt: prompt("revision"),
      entrada: resumen,
      esquema: z.object({
        lectura: texto(400),
        cuello: ProspectStageSchema.nullable(),
        propuesta: z.object({ texto: texto(160), efecto: texto(160) }).nullable(),
      }),
      maxTokens: 400,
    });
  }
}

export function agentesBedrock(modelo: ClienteModelo): Agentes {
  return {
    orquestador: new BedrockPlanificadorOrquestador(modelo),
    icp: new BedrockIcpStructurer(modelo),
    cuentas: new BedrockAccountScorer(modelo),
    enlaces: new BedrockSelectorDeEnlaces(modelo),
    contactos: new BedrockContactResolver(modelo),
    redactor: new BedrockDraftWriter(modelo),
    respuestas: new BedrockReplyClassifier(modelo),
  };
}
