/** Errores que la API traduce a `Problem`. El mensaje es para personas, sin códigos internos. */
export type TipoDeError = "prohibido" | "no_encontrado" | "conflicto" | "invalido";

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
