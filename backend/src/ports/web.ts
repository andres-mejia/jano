/**
 * La web pública de las empresas (spec 008 FR-013, FR-013b). El lector solo trae
 * texto de páginas públicas respetando `robots.txt`; lo que lee se guarda como
 * evidencia con su URL y fecha. Ninguno de los dos puertos ve credenciales.
 */

export interface PaginaLeida {
  readonly url: string;
  readonly titulo: string | null;
  /** Texto principal, sin HTML. */
  readonly texto: string;
  readonly leidaEn: string;
}

/** Una web que no responde o prohíbe el rastreo no es un error: es un motivo de descarte. */
export type LecturaWeb =
  | { readonly ok: true; readonly paginas: readonly PaginaLeida[] }
  | { readonly ok: false; readonly motivo: string };

export interface WebReader {
  leer(dominio: string): Promise<LecturaWeb>;
}

/** Un enlace de la portada a otra página del mismo sitio, con su texto visible. */
export interface EnlaceInterno {
  readonly url: string;
  readonly texto: string;
}

/** Una empresa candidata antes de leer su web. `origen`: `osm:<tipo>/<id>` o `manual`. */
export interface EmpresaCandidata {
  readonly nombre: string;
  readonly dominio: string;
  readonly ciudad: string | null;
  readonly origen: string;
}

export interface CompanySource {
  /** Si sabe buscar en esa región; la API rechaza la petición si no. */
  admite(region: string): boolean;
  buscar(region: string, limite: number): Promise<EmpresaCandidata[]>;
  /** Atribución que exige la licencia de los datos (ODbL en OpenStreetMap), para mostrarla en la app. */
  readonly atribucion: string | null;
}

/** Dominios que pega la persona: sin búsqueda, con origen `manual`. */
export interface FuenteManual {
  candidatas(dominios: readonly string[]): EmpresaCandidata[];
}
