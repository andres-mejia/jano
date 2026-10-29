import { canTransition, type ProspectStage, type SequenceKind, SequenceKindSchema } from "@jano/domain";
import { z } from "zod";

import type { PropuestaOrquestador, PuntoDeDecision, TipoDeAccion } from "../../ports/ia";
import { ETAPA } from "./transiciones";

/**
 * El Orquestador propone, el motor dispone (ADR-002). En cada punto de decisión
 * el menú sale de la etapa y de PROSPECT_TRANSITIONS: el modelo solo elige dentro
 * de él. Lo que proponga fuera, o mal formado, se rechaza con su motivo y el motor
 * escala a una persona; nunca se ejecuta.
 */

const EN_SECUENCIA: ReadonlySet<ProspectStage> = new Set(["in_sequence", "waiting"]);

export function menuDeAcciones(etapa: ProspectStage, punto: PuntoDeDecision, hayPaso: boolean): TipoDeAccion[] {
  const menu: TipoDeAccion[] = [];
  const conSecuencia = EN_SECUENCIA.has(etapa);
  if (punto === "cuenta_aprobada" && etapa === "enriched" && canTransition(etapa, "in_sequence")) menu.push("planificar_secuencia");
  if ((punto === "paso_vencido" || punto === "senal_nueva") && conSecuencia) {
    menu.push("cambiar_rama");
    if (hayPaso) menu.push("pedir_borrador");
  }
  if (punto === "respuesta_clasificada" ? canTransition(etapa, "in_sequence") : conSecuencia) menu.push("esperar_hasta");
  if (conSecuencia && canTransition(etapa, "discarded")) menu.push("detener");
  if (canTransition(etapa, "discarded")) menu.push("descartar");
  menu.push("escalar_a_humano");
  return menu;
}

const texto = z.string().trim().min(1).max(2000);
const AccionSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("planificar_secuencia"), kind: SequenceKindSchema }).strict(),
  z.object({ tipo: z.literal("cambiar_rama"), to: SequenceKindSchema }).strict(),
  z.object({ tipo: z.literal("esperar_hasta"), at: z.string().datetime() }).strict(),
  z.object({ tipo: z.literal("pedir_borrador"), stepId: z.string().uuid() }).strict(),
  z.object({ tipo: z.literal("detener"), motivo: texto }).strict(),
  z.object({ tipo: z.literal("escalar_a_humano"), motivo: texto }).strict(),
  z.object({ tipo: z.literal("descartar"), motivo: texto }).strict(),
]);
export const PropuestaOrquestadorSchema = z.object({
  accion: AccionSchema,
  razonamiento: texto,
  evidencia: z.array(z.string().max(500)).max(10),
});

export interface ContextoDeValidacion {
  readonly etapa: ProspectStage;
  readonly menu: readonly TipoDeAccion[];
  readonly rama: SequenceKind | null;
  readonly pasoId: string | null;
  readonly ahora: Date;
}

const ESPERA_MAXIMA_MS = 180 * 86_400_000;

export type Validacion =
  | { readonly ok: true; readonly propuesta: PropuestaOrquestador }
  | { readonly ok: false; readonly motivo: string };

export function validarPropuesta(propuesta: unknown, c: ContextoDeValidacion): Validacion {
  const forma = PropuestaOrquestadorSchema.safeParse(propuesta);
  if (!forma.success) return { ok: false, motivo: "La propuesta del Orquestador no tiene un formato válido." };
  const p = forma.data as PropuestaOrquestador;
  const a = p.accion;
  if (!c.menu.includes(a.tipo)) return { ok: false, motivo: `«${a.tipo}» no está permitida con el prospect ${ETAPA[c.etapa]}.` };
  switch (a.tipo) {
    case "cambiar_rama":
      if (a.to === c.rama) return { ok: false, motivo: "Ya está en esa rama." };
      if (a.to !== "trigger") return { ok: false, motivo: "Solo se cambia de la rama consultiva a la de señal." };
      break;
    case "esperar_hasta": {
      const t = Date.parse(a.at) - c.ahora.getTime();
      if (t <= 0 || t > ESPERA_MAXIMA_MS) return { ok: false, motivo: "La espera tiene que acabar en el futuro y antes de seis meses." };
      break;
    }
    case "pedir_borrador":
      if (a.stepId !== c.pasoId) return { ok: false, motivo: "El borrador pedido no es el del paso que toca." };
      break;
    default:
      break;
  }
  return { ok: true, propuesta: p };
}

/** Lo que hace el motor cuando rechaza una propuesta: la decisión pasa a una persona. */
export const escalar = (motivo: string): PropuestaOrquestador => ({
  accion: { tipo: "escalar_a_humano", motivo },
  razonamiento: `Propuesta rechazada por el motor: ${motivo}`,
  evidencia: [],
});
