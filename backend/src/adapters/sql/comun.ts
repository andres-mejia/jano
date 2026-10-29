/**
 * Conversión de filas común a Data API y pg. Las fechas viajan como milisegundos
 * (`extract(epoch …)`), los jsonb como texto y los recuentos como `int`: así las dos
 * vías devuelven lo mismo (Data API no tipa timestamptz ni jsonb, y pg devuelve
 * bigint como cadena).
 */

export const ms = (columna: string, alias: string): string => `(extract(epoch from ${columna}) * 1000)::bigint as ${alias}`;

export const iso = (v: unknown): string => new Date(Number(v)).toISOString();
export const isoN = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));

export function json<T>(v: unknown): T {
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
}

export const entero = (v: unknown): number => Number(v ?? 0);

/** Lista de ids como parámetro: Data API no admite arrays, así que va como JSON. */
export const listaJson = (ids: readonly string[]): string => JSON.stringify(ids);
export const EN_LISTA = (param: string) => `(select cast(value as uuid) from jsonb_array_elements_text(cast(:${param} as jsonb)))`;
