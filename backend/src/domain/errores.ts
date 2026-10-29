/** Errores que la API traduce a `Problem`. El mensaje es para personas, sin códigos internos. */
export type TipoDeError = "prohibido" | "no_encontrado" | "conflicto" | "invalido" | "no_disponible";

export class ErrorDeNegocio extends Error {
  constructor(
    readonly tipo: TipoDeError,
    message: string,
  ) {
    super(message);
    this.name = "ErrorDeNegocio";
  }
}

export const prohibido = (m = "No tienes permiso para esta acción.") => new ErrorDeNegocio("prohibido", m);
export const noEncontrado = (m = "No existe o no pertenece a tu empresa.") => new ErrorDeNegocio("no_encontrado", m);
export const conflicto = (m: string) => new ErrorDeNegocio("conflicto", m);
export const invalido = (m: string) => new ErrorDeNegocio("invalido", m);

/**
 * El modelo no ha dado una propuesta utilizable (spec 008 FR-011, FR-016): el tope
 * diario del tenant está agotado, la salida no validó tras el reintento o Bedrock
 * falló. Quien llama decide: la API responde 503 sin cambiar nada, y el motor y el
 * trabajador de cuentas lo dejan en manos de una persona con el motivo.
 */
export class IaNoDisponible extends ErrorDeNegocio {
  constructor(
    readonly motivo: "tope_diario" | "salida_invalida" | "error",
    message: string,
  ) {
    super("no_disponible", message);
    this.name = "IaNoDisponible";
  }
}
