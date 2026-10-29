import type { SequenceKind, StepStatus } from "@jano/domain";

/**
 * Planificación de pasos (ADR-003): esperar es un dato. Al planificar una rama,
 * solo el primer paso lleva fecha; cada paso siguiente se fecha al enviarse el
 * anterior, `(día siguiente − día enviado) × minutosPorDia` después. Así una
 * aprobación que tarda no deja dos pasos vencidos a la vez. `minutosPorDia` es
 * DEMO_DAY_MINUTES (1440 por defecto): en la demo un «día» puede durar minutos.
 */

export interface PlantillaPaso {
  readonly dia: number;
  readonly titulo: string;
  readonly intencion: string;
}

export const PLANTILLAS: Readonly<Record<SequenceKind, readonly PlantillaPaso[]>> = {
  consultiva: [
    { dia: 0, titulo: "Email personalizado", intencion: "Presentarse con algo concreto de su web" },
    { dia: 3, titulo: "Caso de uso", intencion: "Ejemplo de una empresa de tamaño similar" },
    { dia: 7, titulo: "Hipótesis de problema", intencion: "Plantear el problema que suele tener una empresa como la suya" },
    { dia: 12, titulo: "Email de cierre", intencion: "Cerrar con amabilidad y dejar la puerta abierta" },
  ],
  trigger: [
    { dia: 0, titulo: "Email por señal de compra", intencion: "Relacionar la señal con la carga de prospección" },
    { dia: 2, titulo: "Seguimiento de la señal", intencion: "Aportar un dato ligado a la señal" },
    { dia: 6, titulo: "Email de cierre", intencion: "Cerrar con amabilidad y dejar la puerta abierta" },
  ],
};

export interface PasoNuevo {
  readonly branch: SequenceKind;
  readonly position: number;
  readonly day: number;
  readonly channel: "email";
  readonly title: string;
  readonly intent: string;
  readonly status: Extract<StepStatus, "planned" | "awaiting_approval">;
  readonly scheduledFor: Date | null;
  readonly proposal: "cambio_de_rama" | null;
}

export interface PasoExistente {
  readonly id: string;
  readonly branch: SequenceKind;
  readonly position: number;
  readonly day: number;
  readonly status: StepStatus;
  readonly proposal: "cambio_de_rama" | null;
}

const PENDIENTE: ReadonlySet<StepStatus> = new Set(["planned", "awaiting_approval"]);

export function planificarSecuencia(kind: SequenceKind, inicio: Date): PasoNuevo[] {
  return PLANTILLAS[kind].map((p, i) => ({
    branch: kind,
    position: i,
    day: p.dia,
    channel: "email",
    title: p.titulo,
    intent: p.intencion,
    status: "planned",
    scheduledFor: i === 0 ? inicio : null,
    proposal: null,
  }));
}

/** Fecha del siguiente paso pendiente de la rama tras enviar uno; `null` si no queda. */
export function siguientePaso(
  pasos: readonly PasoExistente[],
  enviado: PasoExistente,
  enviadoEn: Date,
  minutosPorDia: number,
): { readonly id: string; readonly scheduledFor: Date } | null {
  const sig = pasos
    .filter((p) => p.branch === enviado.branch && p.position > enviado.position && p.status === "planned")
    .sort((a, b) => a.position - b.position)[0];
  if (!sig) return null;
  return { id: sig.id, scheduledFor: new Date(enviadoEn.getTime() + Math.max(0, sig.day - enviado.day) * minutosPorDia * 60_000) };
}

/**
 * Propuesta de cambio de rama (US4b): el primer paso de la rama nueva, en espera
 * de aprobación y marcado como propuesta. Va detrás de todos los existentes.
 */
export function pasoDeCambioDeRama(pasos: readonly PasoExistente[], hacia: SequenceKind, diaActual: number): PasoNuevo {
  const p = PLANTILLAS[hacia][0];
  if (!p) throw new Error(`plantilla vacía: ${hacia}`);
  return {
    branch: hacia,
    position: Math.max(-1, ...pasos.map((x) => x.position)) + 1,
    day: diaActual + p.dia,
    channel: "email",
    title: p.titulo,
    intent: p.intencion,
    status: "awaiting_approval",
    scheduledFor: null,
    proposal: "cambio_de_rama",
  };
}

/**
 * Aplicar el cambio al aprobar la propuesta: los pendientes de la rama anterior
 * pasan a `skipped` y se planifican los demás pasos de la nueva, sin fecha hasta
 * que salga la propuesta.
 */
export function aplicarCambioDeRama(
  pasos: readonly PasoExistente[],
  propuesta: PasoExistente,
): { readonly omitidos: readonly string[]; readonly nuevos: readonly PasoNuevo[] } {
  const omitidos = pasos.filter((p) => p.branch !== propuesta.branch && PENDIENTE.has(p.status)).map((p) => p.id);
  const base = propuesta.day - (PLANTILLAS[propuesta.branch][0]?.dia ?? 0);
  const nuevos = PLANTILLAS[propuesta.branch].slice(1).map((p, i) => ({
    branch: propuesta.branch,
    position: propuesta.position + 1 + i,
    day: base + p.dia,
    channel: "email" as const,
    title: p.titulo,
    intent: p.intencion,
    status: "planned" as const,
    scheduledFor: null,
    proposal: null,
  }));
  return { omitidos, nuevos };
}

/** Un seguimiento suelto (ausencia, «ahora no»): un paso de la rama actual con fecha. */
export function pasoDeSeguimiento(pasos: readonly PasoExistente[], rama: SequenceKind, cuando: Date, titulo: string, intencion: string): PasoNuevo {
  const ultimo = [...pasos].sort((a, b) => b.position - a.position)[0];
  return {
    branch: rama,
    position: (ultimo?.position ?? -1) + 1,
    day: ultimo?.day ?? 0,
    channel: "email",
    title: titulo,
    intent: intencion,
    status: "planned",
    scheduledFor: cuando,
    proposal: null,
  };
}

/** Pasos que una respuesta, una baja o una parada cancelan. */
export const pendientes = (pasos: readonly PasoExistente[]): string[] => pasos.filter((p) => PENDIENTE.has(p.status)).map((p) => p.id);
