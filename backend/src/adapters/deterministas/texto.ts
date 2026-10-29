/** Utilidades de los adaptadores deterministas: mismo texto, mismo resultado. */

/** FNV-1a de 32 bits: reparte sin aleatoriedad. */
export function huella(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Minúsculas y sin tildes, para buscar palabras sin depender de cómo se escriban. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function slug(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const FORMATO_MADRID = new Intl.DateTimeFormat("es-ES", {
  timeZone: "Europe/Madrid",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export const enMadrid = (iso: string): string => FORMATO_MADRID.format(new Date(iso));
