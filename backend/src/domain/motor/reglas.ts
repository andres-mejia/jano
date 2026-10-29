import type { RuleCheck } from "@jano/domain";

import type { ListaBlanca } from "./lista-blanca";
import { siguienteMedianocheEnMadrid } from "./tiempo";

/**
 * Reglas fijas antes de cada envío (ADR-002, spec 008 FR-003), en este orden:
 * supresión, respuesta previa, lista blanca (solo fuera de producción), email
 * verificado o de la lista blanca, límite diario del buzón. Se evalúan todas y
 * todas quedan registradas, pasen o no; el veredicto lo da la primera que falla.
 * El límite diario no bloquea: aplaza a las 00:00 de Madrid.
 */

export const REGLA = {
  supresion: "No está en la lista de supresión",
  respuestaPrevia: "Sin respuesta previa que detenga la secuencia",
  listaBlanca: "Destinatario en la lista blanca (fuera de producción)",
  emailVerificado: "Email verificado o de la lista blanca",
  limiteDiario: "Dentro del límite diario del buzón",
} as const;

export interface EntradaReglas {
  readonly destinatario: string | null;
  readonly emailVerificado: boolean;
  readonly suprimido: boolean;
  /** El contacto respondió después de planificarse este paso. */
  readonly respondio: boolean;
  /** Es la contestación a su respuesta (bandeja): la respuesta previa no la detiene. */
  readonly esContestacion: boolean;
  /** `null` en producción: no hay lista blanca. */
  readonly listaBlanca: ListaBlanca | null;
  readonly requiereVerificado: boolean;
  readonly enviosHoy: number;
  readonly limiteDiario: number;
  readonly ahora: Date;
}

export type Veredicto =
  | { readonly tipo: "enviar" }
  | { readonly tipo: "bloquear"; readonly regla: string; readonly detalle: string }
  | { readonly tipo: "aplazar"; readonly regla: string; readonly detalle: string; readonly hasta: Date };

export interface Evaluacion {
  readonly comprobadas: readonly RuleCheck[];
  readonly veredicto: Veredicto;
}

export function evaluarReglas(e: EntradaReglas): Evaluacion {
  const enLista = !!e.destinatario && !!e.listaBlanca?.admite(e.destinatario);
  const comprobadas: RuleCheck[] = [
    {
      rule: REGLA.supresion,
      passed: !e.suprimido,
      detail: e.suprimido ? "Pidió la baja: no se le vuelve a escribir" : null,
    },
    {
      rule: REGLA.respuestaPrevia,
      passed: e.esContestacion || !e.respondio,
      detail: e.esContestacion ? "Es la contestación a su respuesta" : e.respondio ? "Ha respondido: la secuencia se detiene" : null,
    },
    {
      rule: REGLA.listaBlanca,
      passed: e.listaBlanca === null || enLista,
      detail:
        e.listaBlanca === null
          ? "Producción: sin lista blanca"
          : enLista
            ? "Destinatario de prueba"
            : `${e.destinatario ?? "Sin destinatario"} no está en la lista blanca`,
    },
    {
      rule: REGLA.emailVerificado,
      passed: !!e.destinatario && (!e.requiereVerificado || e.emailVerificado || enLista),
      detail: !e.destinatario
        ? "Sin email"
        : e.emailVerificado
          ? "Verificado"
          : enLista
            ? "De la lista blanca"
            : e.requiereVerificado
              ? "Sin verificar: no se envía"
              : "Sin verificar; la regla está desactivada",
    },
    {
      rule: REGLA.limiteDiario,
      passed: e.enviosHoy < e.limiteDiario,
      detail: `${e.enviosHoy} de ${e.limiteDiario}`,
    },
  ];

  const falla = comprobadas.find((c) => !c.passed);
  if (!falla) return { comprobadas, veredicto: { tipo: "enviar" } };
  const detalle = falla.detail ?? falla.rule;
  if (falla.rule === REGLA.limiteDiario) {
    return { comprobadas, veredicto: { tipo: "aplazar", regla: falla.rule, detalle, hasta: siguienteMedianocheEnMadrid(e.ahora) } };
  }
  return { comprobadas, veredicto: { tipo: "bloquear", regla: falla.rule, detalle } };
}
