import { canTransition, type ProspectStage } from "@jano/domain";

/**
 * La máquina de estados del prospect (ADR-002, spec 008 FR-002): la única puerta
 * para cambiar de etapa. Una transición fuera de PROSPECT_TRANSITIONS no lanza:
 * devuelve el motivo para que el caso de uso registre un evento `rejected` y
 * responda 409 sin deshacer ese registro.
 */

export const ETAPA: Readonly<Record<ProspectStage, string>> = {
  found: "encontrado",
  enriched: "con contacto",
  unverified: "sin verificar",
  in_sequence: "en secuencia",
  waiting: "en espera",
  replied: "respondió",
  meeting: "reunión",
  not_now: "ahora no",
  opted_out: "baja",
  discarded: "descartado",
};

export type Transicion =
  | { readonly ok: true; readonly desde: ProspectStage; readonly hacia: ProspectStage }
  | { readonly ok: false; readonly desde: ProspectStage; readonly hacia: ProspectStage; readonly motivo: string };

export function comprobarTransicion(desde: ProspectStage, hacia: ProspectStage): Transicion {
  if (canTransition(desde, hacia)) return { ok: true, desde, hacia };
  return { ok: false, desde, hacia, motivo: `No se puede pasar de «${ETAPA[desde]}» a «${ETAPA[hacia]}».` };
}
