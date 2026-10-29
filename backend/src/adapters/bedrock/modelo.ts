import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { z } from "zod";

import { IaNoDisponible } from "../../domain/errores";
import { enMadrid } from "../../domain/motor/tiempo";
import { limpiarPiiProfundo } from "../../domain/pii";
import type { Reloj } from "../../ports/reloj";
import type { Prompt } from "./prompts";

/**
 * Llamadas al modelo (spec 008 FR-010, FR-011, FR-014, FR-016). Converse API de
 * Bedrock directa, sin framework de agentes ni herramientas (FR-012): el modelo
 * recibe una entrada JSON y devuelve una propuesta JSON. Cada llamada:
 *
 *   1. Pasa la entrada por el PiiStripper y anota qué sustituyó.
 *   2. Reserva una llamada del tope diario del tenant (500 por defecto) antes de
 *      llamar; si no queda, no llama.
 *   3. Valida la salida con zod y con las comprobaciones del agente; si no vale,
 *      un reintento con el motivo y después fallo registrado.
 *   4. Deja un log JSON con tenant, agente, modelo, tokens, latencia y coste
 *      estimado, y suma tokens y coste al uso del día.
 */

export const MODELO_POR_DEFECTO = "eu.anthropic.claude-sonnet-4-6";

export interface MensajeModelo {
  readonly rol: "user" | "assistant";
  readonly texto: string;
}

export interface RespuestaModelo {
  readonly texto: string;
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
  readonly latenciaMs: number;
  readonly parada: string | null;
}

/** El transporte al modelo. En producción, Bedrock; en tests, un guion. */
export interface Conversador {
  readonly modelo: string;
  conversar(p: { sistema: string; mensajes: readonly MensajeModelo[]; maxTokens: number }): Promise<RespuestaModelo>;
}

export class BedrockConversador implements Conversador {
  constructor(
    readonly modelo: string = MODELO_POR_DEFECTO,
    private readonly cliente = new BedrockRuntimeClient({}),
  ) {}

  async conversar(p: { sistema: string; mensajes: readonly MensajeModelo[]; maxTokens: number }): Promise<RespuestaModelo> {
    const inicio = Date.now();
    const r = await this.cliente.send(
      new ConverseCommand({
        modelId: this.modelo,
        system: [{ text: p.sistema }],
        messages: p.mensajes.map((m) => ({ role: m.rol, content: [{ text: m.texto }] })),
        inferenceConfig: { maxTokens: p.maxTokens },
      }),
    );
    return {
      texto: (r.output?.message?.content ?? []).map((c) => c.text ?? "").join(""),
      tokensEntrada: r.usage?.inputTokens ?? 0,
      tokensSalida: r.usage?.outputTokens ?? 0,
      latenciaMs: r.metrics?.latencyMs ?? Date.now() - inicio,
      parada: r.stopReason ?? null,
    };
  }
}

/** Tope diario de llamadas por tenant (FR-016). La implementación real está en Postgres. */
export interface TopeDeLlamadas {
  reservar(tenantId: string, dia: string, tope: number): Promise<boolean>;
  anotar(tenantId: string, dia: string, uso: { tokensEntrada: number; tokensSalida: number; costeUsd: number }): Promise<void>;
}

/** Dólares por millón de tokens. */
export interface Precio {
  readonly entrada: number;
  readonly salida: number;
}

/**
 * Sonnet 4.6 en Bedrock con perfil geográfico `eu.*`: 3 $ / 15 $ por millón más el
 * 10 % de los perfiles regionales. Es una estimación para el log y el tope; la
 * cifra que vale es la de la factura de AWS. Se cambia con BEDROCK_PRECIO_*.
 */
export const PRECIO_POR_DEFECTO: Precio = { entrada: 3.3, salida: 16.5 };

export interface OpcionesCliente {
  readonly conversador: Conversador;
  readonly tope: TopeDeLlamadas;
  /** El tenant en curso (contexto-tenant.ts): sin él no se llama al modelo. */
  readonly tenant: () => string | null;
  readonly reloj: Reloj;
  readonly precio?: Precio;
  readonly topeDiario?: number;
  readonly registrar?: (linea: Record<string, unknown>) => void;
}

export interface Pedido<T> {
  readonly agente: string;
  readonly prompt: Prompt;
  readonly entrada: unknown;
  readonly esquema: z.ZodType<T, z.ZodTypeDef, unknown>;
  /** Comprobaciones que zod no expresa (URLs leídas, palabras, precios); devuelve el motivo o null. */
  readonly comprobar?: (salida: T) => string | null;
  readonly maxTokens?: number;
}

const INTENTOS = 2;

export const diaEnMadrid = (t: Date): string => {
  const f = enMadrid(t);
  return `${f.anio}-${String(f.mes).padStart(2, "0")}-${String(f.dia).padStart(2, "0")}`;
};

/** El primer objeto JSON de la respuesta, venga solo o entre ```json … ```. */
export function extraerJson(texto: string): unknown {
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(limpio);
  } catch {
    const i = limpio.indexOf("{");
    const j = limpio.lastIndexOf("}");
    if (i < 0 || j <= i) return undefined;
    try {
      return JSON.parse(limpio.slice(i, j + 1));
    } catch {
      return undefined;
    }
  }
}

export class ClienteModelo {
  private readonly precio: Precio;
  private readonly topeDiario: number;
  private readonly registrar: (linea: Record<string, unknown>) => void;

  constructor(private readonly o: OpcionesCliente) {
    this.precio = o.precio ?? PRECIO_POR_DEFECTO;
    this.topeDiario = o.topeDiario ?? 500;
    this.registrar = o.registrar ?? ((l) => console.log(JSON.stringify(l)));
  }

  get modelo(): string {
    return this.o.conversador.modelo;
  }

  async pedir<T>(p: Pedido<T>): Promise<T> {
    const tenantId = this.o.tenant();
    if (!tenantId) throw new IaNoDisponible("error", "Llamada al modelo sin tenant en curso.");
    const limpia = limpiarPiiProfundo(p.entrada);
    const base = {
      tenant_id: tenantId,
      agente: p.agente,
      modelo: this.o.conversador.modelo,
      prompt: `${p.prompt.nombre}@${p.prompt.version}`,
      pii: { aplicado: true, sustituciones: limpia.sustituciones },
    };
    const mensajes: MensajeModelo[] = [{ rol: "user", texto: `Entrada (JSON):\n${JSON.stringify(limpia.valor, null, 2)}` }];

    let motivo = "";
    for (let intento = 1; intento <= INTENTOS; intento++) {
      const dia = diaEnMadrid(this.o.reloj.ahora());
      if (!(await this.o.tope.reservar(tenantId, dia, this.topeDiario))) {
        this.registrar({ msg: "ia_tope_diario", ...base, tope: this.topeDiario });
        throw new IaNoDisponible("tope_diario", `Se ha alcanzado el tope diario de ${this.topeDiario} llamadas a la IA; vuelve a intentarlo mañana.`);
      }

      let r: RespuestaModelo;
      try {
        r = await this.o.conversador.conversar({ sistema: p.prompt.texto, mensajes, maxTokens: p.maxTokens ?? 1500 });
      } catch (e) {
        const error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        this.registrar({ msg: "ia_error", ...base, intento, error });
        throw new IaNoDisponible("error", `La IA no responde ahora (${error}).`);
      }
      const costeUsd = (r.tokensEntrada * this.precio.entrada + r.tokensSalida * this.precio.salida) / 1_000_000;
      try {
        await this.o.tope.anotar(tenantId, dia, { tokensEntrada: r.tokensEntrada, tokensSalida: r.tokensSalida, costeUsd });
      } catch (e) {
        this.registrar({ msg: "ia_consumo_sin_anotar", ...base, error: e instanceof Error ? e.message : String(e) });
      }

      const salida = this.validar(p, r.texto);
      this.registrar({
        msg: "ia_llamada",
        ...base,
        intento,
        tokens_entrada: r.tokensEntrada,
        tokens_salida: r.tokensSalida,
        latencia_ms: r.latenciaMs,
        coste_usd: Number(costeUsd.toFixed(6)),
        parada: r.parada,
        valida: salida.ok,
        ...(salida.ok ? {} : { motivo: salida.motivo }),
      });
      if (salida.ok) return salida.valor;
      motivo = salida.motivo;
      mensajes.push(
        { rol: "assistant", texto: r.texto || "(vacío)" },
        { rol: "user", texto: `Tu respuesta no es válida: ${motivo}. Devuelve solo el objeto JSON corregido, sin texto alrededor.` },
      );
    }
    this.registrar({ msg: "ia_fallo", ...base, intentos: INTENTOS, motivo });
    throw new IaNoDisponible("salida_invalida", `La IA no ha devuelto una propuesta válida (${motivo}).`);
  }

  private validar<T>(p: Pedido<T>, texto: string): { ok: true; valor: T } | { ok: false; motivo: string } {
    const json = extraerJson(texto);
    if (json === undefined) return { ok: false, motivo: "no es JSON" };
    const r = p.esquema.safeParse(json);
    if (!r.success) {
      const i = r.error.issues[0];
      return { ok: false, motivo: `no cumple el esquema (${i ? `${i.path.join(".") || "raíz"}: ${i.message}` : "formato"})` };
    }
    const fallo = p.comprobar?.(r.data) ?? null;
    return fallo ? { ok: false, motivo: fallo } : { ok: true, valor: r.data };
  }
}
