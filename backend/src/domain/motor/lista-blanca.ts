/**
 * Lista blanca de destinatarios fuera de producción (spec 008 FR-021): mientras no
 * haya dictamen legal, solo se escribe a estas direcciones. Admite alias con `+`
 * al estilo de Gmail: con `persona@gmail.example` en la lista, también vale
 * `persona+albufera@gmail.example`. Es una regla del motor, no del adaptador.
 */
export interface ListaBlanca {
  readonly direcciones: readonly string[];
  admite(email: string): boolean;
  /** Un alias por cuenta sobre la primera dirección, para distinguir respuestas en la demo. */
  aliasPara(etiqueta: string): string | null;
}

function partes(email: string): { local: string; dominio: string } | null {
  const e = email.trim().toLowerCase();
  const arroba = e.lastIndexOf("@");
  if (arroba < 1 || arroba === e.length - 1) return null;
  return { local: e.slice(0, arroba), dominio: e.slice(arroba + 1) };
}

const base = (local: string) => local.split("+")[0] ?? local;

/** `MAIL_ALLOWLIST`: direcciones separadas por comas o espacios. Vacía = sin lista blanca. */
export function crearListaBlanca(texto: string): ListaBlanca {
  const direcciones = texto
    .split(/[\s,;]+/)
    .map((d) => d.trim().toLowerCase())
    .filter((d) => partes(d) !== null);
  const claves = new Set(direcciones.map((d) => {
    const p = partes(d);
    return p ? `${base(p.local)}@${p.dominio}` : d;
  }));
  return {
    direcciones,
    admite(email) {
      const p = partes(email);
      return !!p && claves.has(`${base(p.local)}@${p.dominio}`);
    },
    aliasPara(etiqueta) {
      const p = direcciones[0] ? partes(direcciones[0]) : null;
      if (!p) return null;
      const limpia = etiqueta.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      return limpia ? `${base(p.local)}+${limpia}@${p.dominio}` : `${base(p.local)}@${p.dominio}`;
    },
  };
}
