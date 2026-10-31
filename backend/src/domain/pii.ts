/**
 * PiiStripper (spec 008 FR-014, spec 004 FR-003): antes de cada llamada al modelo,
 * los datos personales de terceros que aparezcan en el texto (IBAN, emails,
 * NIF/DNI/NIE/CIF y teléfonos) se sustituyen por marcadores. El modelo no los
 * necesita para puntuar, redactar ni clasificar, y así no salen del motor. Lo que
 * se sustituyó se cuenta por tipo para registrar que el filtro se aplicó.
 *
 * Se aplica a texto libre (webs leídas, respuestas, frases de la persona). Los
 * identificadores, URLs y fechas que el motor necesita de vuelta no se tocan.
 */

export type TipoPii = "iban" | "email" | "nif" | "telefono";

export const MARCADOR: Readonly<Record<TipoPii, string>> = {
  iban: "[IBAN]",
  email: "[EMAIL]",
  nif: "[NIF]",
  telefono: "[TELÉFONO]",
};

// El orden importa: un IBAN contiene cifras que parecerían un teléfono, y un email
// puede llevar un NIF en la parte local.
const PATRONES: readonly (readonly [TipoPii, RegExp])[] = [
  ["iban", /\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]{4}){3,7}(?:[ -]?[A-Z0-9]{1,3})?\b/g],
  ["email", /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
  // NIE (X/Y/Z + 7 cifras + letra), DNI (8 cifras + letra) y CIF (letra + 7 cifras + control).
  ["nif", /\b(?:ES[ -]?)?(?:[XYZ][ -]?\d{7}[ -]?[A-Z]|\d{8}[ -]?[A-Z]|[ABCDEFGHJNPQRSUVW][ -]?\d{7}[0-9A-J])\b/g],
  // Españoles (9 cifras que empiezan por 6, 7, 8 o 9, con o sin +34) e internacionales con +.
  ["telefono", /(?<![\w+\-/.])(?:(?:\+|00)34[ .-]?)?[6789](?:[ .-]?\d){8}(?![\w\-/])|(?<![\w+])\+\d{1,3}(?:[ .-]?\(?\d\)?){6,12}(?![\w\-/])/g],
];

export interface Limpieza {
  readonly texto: string;
  readonly sustituciones: Readonly<Partial<Record<TipoPii, number>>>;
}

export function limpiarPii(texto: string): Limpieza {
  const sustituciones: Partial<Record<TipoPii, number>> = {};
  let limpio = texto;
  for (const [tipo, re] of PATRONES) {
    limpio = limpio.replace(re, () => {
      sustituciones[tipo] = (sustituciones[tipo] ?? 0) + 1;
      return MARCADOR[tipo];
    });
  }
  return { texto: limpio, sustituciones };
}

const INTACTO = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // ids
  /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/, // fechas ISO
  /^https?:\/\/\S+$/, // URLs que el modelo tiene que citar de vuelta
];

/**
 * Limpia todas las cadenas de una entrada estructurada (lo que se envía al modelo
 * como JSON), salvo ids, fechas ISO y URLs. Devuelve la entrada limpia y el total
 * de sustituciones por tipo.
 */
export function limpiarPiiProfundo<T>(valor: T): { readonly valor: T; readonly sustituciones: Readonly<Partial<Record<TipoPii, number>>> } {
  const total: Partial<Record<TipoPii, number>> = {};
  const recorrer = (v: unknown): unknown => {
    if (typeof v === "string") {
      if (INTACTO.some((re) => re.test(v))) return v;
      const l = limpiarPii(v);
      for (const [tipo, n] of Object.entries(l.sustituciones) as [TipoPii, number][]) total[tipo] = (total[tipo] ?? 0) + n;
      return l.texto;
    }
    if (Array.isArray(v)) return v.map(recorrer);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recorrer(x)]));
    return v;
  };
  return { valor: recorrer(valor) as T, sustituciones: total };
}
