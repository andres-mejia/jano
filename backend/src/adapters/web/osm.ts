import { CompanyDomainSchema } from "@jano/domain";
import { z } from "zod";

import type { CompanySource, EmpresaCandidata, FuenteManual } from "../../ports/web";
import { normalizar } from "../deterministas/texto";

/**
 * Candidatas de OpenStreetMap (spec 008 FR-013b) por la API de Overpass: agencias
 * de viajes (`shop=travel_agency`, `office=travel_agent`) con web propia y sin
 * etiqueta `brand` (las de cadena quedan fuera). La consulta va por provincias,
 * una a una, porque la de toda una comunidad grande agota el tiempo del servidor
 * público (research.md). Cada candidata guarda su origen `osm:<tipo>/<id>`, y la
 * licencia ODbL obliga a mostrar la atribución en la app.
 *
 * La caché de 24 h no vive aquí: la lleva el caso de uso en Postgres, por tenant
 * (`cache_candidatas`), para que el adaptador no tenga estado.
 */

export const ATRIBUCION_OSM = "© Colaboradores de OpenStreetMap · datos con licencia ODbL (openstreetmap.org/copyright)";
export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const AGENTE = "JanoBot/0.1 (+https://jano.tekhos.com; candidatas de una campaña, una consulta por provincia y día)";

/** Provincias por su código ISO 3166-2, con los nombres con los que pueden aparecer en un ICP. */
const PROVINCIAS: Readonly<Record<string, readonly string[]>> = {
  "ES-A": ["Alicante", "Alacant"], "ES-CS": ["Castellón", "Castelló"], "ES-V": ["Valencia", "València"],
  "ES-AL": ["Almería"], "ES-CA": ["Cádiz"], "ES-CO": ["Córdoba"], "ES-GR": ["Granada"], "ES-H": ["Huelva"],
  "ES-J": ["Jaén"], "ES-MA": ["Málaga"], "ES-SE": ["Sevilla"], "ES-HU": ["Huesca"], "ES-TE": ["Teruel"],
  "ES-Z": ["Zaragoza"], "ES-O": ["Asturias"], "ES-PM": ["Illes Balears", "Baleares", "Islas Baleares", "Mallorca"],
  "ES-GC": ["Las Palmas", "Gran Canaria"], "ES-TF": ["Santa Cruz de Tenerife", "Tenerife"], "ES-S": ["Cantabria"],
  "ES-AV": ["Ávila"], "ES-BU": ["Burgos"], "ES-LE": ["León"], "ES-P": ["Palencia"], "ES-SA": ["Salamanca"],
  "ES-SG": ["Segovia"], "ES-SO": ["Soria"], "ES-VA": ["Valladolid"], "ES-ZA": ["Zamora"], "ES-AB": ["Albacete"],
  "ES-CR": ["Ciudad Real"], "ES-CU": ["Cuenca"], "ES-GU": ["Guadalajara"], "ES-TO": ["Toledo"],
  "ES-B": ["Barcelona"], "ES-GI": ["Girona", "Gerona"], "ES-L": ["Lleida", "Lérida"], "ES-T": ["Tarragona"],
  "ES-BA": ["Badajoz"], "ES-CC": ["Cáceres"], "ES-C": ["A Coruña", "La Coruña"], "ES-LU": ["Lugo"],
  "ES-OR": ["Ourense", "Orense"], "ES-PO": ["Pontevedra"], "ES-M": ["Madrid"], "ES-MU": ["Murcia"],
  "ES-NA": ["Navarra", "Nafarroa"], "ES-BI": ["Bizkaia", "Vizcaya"], "ES-SS": ["Gipuzkoa", "Guipúzcoa"],
  "ES-VI": ["Álava", "Araba"], "ES-LO": ["La Rioja"],
};

/** Comunidades autónomas y las provincias en que se trocea su consulta. */
const COMUNIDADES: readonly (readonly [nombres: readonly string[], provincias: readonly string[]])[] = [
  [["Comunitat Valenciana", "Comunidad Valenciana", "País Valencià"], ["ES-V", "ES-A", "ES-CS"]],
  [["Andalucía"], ["ES-AL", "ES-CA", "ES-CO", "ES-GR", "ES-H", "ES-J", "ES-MA", "ES-SE"]],
  [["Aragón"], ["ES-HU", "ES-TE", "ES-Z"]],
  [["Principado de Asturias"], ["ES-O"]],
  [["Canarias", "Islas Canarias"], ["ES-GC", "ES-TF"]],
  [["Castilla y León"], ["ES-AV", "ES-BU", "ES-LE", "ES-P", "ES-SA", "ES-SG", "ES-SO", "ES-VA", "ES-ZA"]],
  [["Castilla-La Mancha", "Castilla La Mancha"], ["ES-AB", "ES-CR", "ES-CU", "ES-GU", "ES-TO"]],
  [["Cataluña", "Catalunya"], ["ES-B", "ES-GI", "ES-L", "ES-T"]],
  [["Extremadura"], ["ES-BA", "ES-CC"]],
  [["Galicia"], ["ES-C", "ES-LU", "ES-OR", "ES-PO"]],
  [["Comunidad de Madrid"], ["ES-M"]],
  [["Región de Murcia"], ["ES-MU"]],
  [["Comunidad Foral de Navarra"], ["ES-NA"]],
  [["País Vasco", "Euskadi"], ["ES-BI", "ES-SS", "ES-VI"]],
];

const clave = (t: string) => normalizar(t).replace(/[^a-z]+/g, " ").trim();

/** Provincias de una región del ICP (comunidad o provincia). Vacío si no se reconoce. */
export function provinciasDe(region: string): string[] {
  const r = clave(region);
  const comunidad = COMUNIDADES.find(([nombres]) => nombres.some((n) => clave(n) === r));
  if (comunidad) return [...comunidad[1]];
  const provincia = Object.entries(PROVINCIAS).find(([, nombres]) => nombres.some((n) => clave(n) === r));
  return provincia ? [provincia[0]] : [];
}

export function consultaOverpass(provincia: string): string {
  const filtros = ['nwr["shop"="travel_agency"]', 'nwr["office"="travel_agent"]']
    .flatMap((f) => [`${f}["website"][!"brand"](area.a);`, `${f}["contact:website"][!"brand"](area.a);`])
    .join("");
  return `[out:json][timeout:25];area["ISO3166-2"="${provincia}"]["boundary"="administrative"]->.a;(${filtros});out tags;`;
}

const RespuestaOverpassSchema = z.object({
  elements: z.array(
    z.object({
      type: z.enum(["node", "way", "relation"]),
      id: z.number().int(),
      tags: z.record(z.string()).default({}),
    }),
  ),
});

/** Webs que no son de la agencia: redes sociales y directorios. */
const NO_PROPIAS = /(^|\.)(facebook|instagram|twitter|x|linkedin|tiktok|youtube|wa|linktr|google|business\.site|sites\.google|booking|tripadvisor)\.(com|me|ee|site|es)$/;

/** Las agencias de la respuesta con un dominio propio válido, una por dominio. */
export function candidatasDe(respuesta: unknown): EmpresaCandidata[] {
  const { elements } = RespuestaOverpassSchema.parse(respuesta);
  const vistas = new Map<string, EmpresaCandidata>();
  for (const e of elements) {
    if (e.tags["brand"]) continue;
    const web = e.tags["website"] ?? e.tags["contact:website"];
    const dominio = web ? CompanyDomainSchema.safeParse(web) : null;
    if (!dominio?.success || NO_PROPIAS.test(dominio.data) || vistas.has(dominio.data)) continue;
    vistas.set(dominio.data, {
      nombre: (e.tags["name"] ?? dominio.data).trim().slice(0, 200),
      dominio: dominio.data,
      ciudad: e.tags["addr:city"] ?? null,
      origen: `osm:${e.type}/${e.id}`,
    });
  }
  return [...vistas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export interface OpcionesOsm {
  readonly url?: string;
  readonly timeoutMs?: number;
  /** Espera antes del único reintento tras un 429 o 504 del servidor público. */
  readonly esperaReintentoMs?: number;
  readonly pedir?: typeof fetch;
}

export class OsmCompanySource implements CompanySource {
  readonly atribucion = ATRIBUCION_OSM;

  constructor(private readonly o: OpcionesOsm = {}) {}

  admite(region: string): boolean {
    return provinciasDe(region).length > 0;
  }

  async buscar(region: string, limite: number): Promise<EmpresaCandidata[]> {
    const provincias = provinciasDe(region);
    if (!provincias.length) throw new Error(`región no reconocida: ${region}`);
    const todas = new Map<string, EmpresaCandidata>();
    // Una provincia detrás de otra: el servidor público limita las consultas simultáneas.
    for (const p of provincias) {
      if (todas.size >= limite) break;
      for (const c of candidatasDe(await this.consultar(p))) if (!todas.has(c.dominio)) todas.set(c.dominio, c);
    }
    return [...todas.values()].slice(0, limite);
  }

  private async consultar(provincia: string): Promise<unknown> {
    const pedir = this.o.pedir ?? fetch;
    for (let intento = 0; ; intento++) {
      const res = await pedir(this.o.url ?? OVERPASS_URL, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded", "user-agent": AGENTE },
        body: new URLSearchParams({ data: consultaOverpass(provincia) }).toString(),
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 40_000),
      });
      if ((res.status === 429 || res.status === 504) && intento === 0) {
        await res.body?.cancel();
        await new Promise((r) => setTimeout(r, this.o.esperaReintentoMs ?? 5000));
        continue;
      }
      if (!res.ok) throw new Error(`Overpass respondió ${res.status} para ${provincia}`);
      return res.json();
    }
  }
}

/** Dominios pegados a mano: sin búsqueda, con origen `manual` y el nombre deducido del dominio. */
export class ManualCompanySource implements FuenteManual {
  candidatas(dominios: readonly string[]): EmpresaCandidata[] {
    return dominios.map((d) => ({ nombre: nombreDeDominio(d), dominio: d, ciudad: null, origen: "manual" }));
  }
}

export const nombreDeDominio = (d: string): string => {
  const base = d.split(".")[0] ?? d;
  return base.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
};
