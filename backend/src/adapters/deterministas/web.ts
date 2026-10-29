import type { Reloj } from "../../ports/reloj";
import type { CompanySource, EmpresaCandidata, LecturaWeb, WebReader } from "../../ports/web";
import { huella, slug } from "./texto";

/**
 * Web y candidatas deterministas: empresas inventadas con dominios `.example`
 * (AGENTS.md §5). Un dominio con «caida» no responde y uno con «robots» prohíbe
 * el rastreo, para probar los descartes sin red.
 */

const NOMBRES = ["Viajes", "Rutas", "Destinos", "Horizonte", "Brújula", "Travesía", "Mundo", "Escapadas"] as const;
const APELLIDOS = ["Azahar", "Albufera", "del Turia", "Mediterráneo", "Norte", "Levante", "Costa", "Sol"] as const;

export class DeterministicCompanySource implements CompanySource {
  async buscar(region: string, limite: number): Promise<EmpresaCandidata[]> {
    const h = huella(region);
    const total = Math.min(limite, 30 + (h % 21));
    return Array.from({ length: total }, (_, i) => {
      const nombre = `${NOMBRES[(h + i) % NOMBRES.length]} ${APELLIDOS[(i * 3 + h) % APELLIDOS.length]} ${i + 1}`;
      const marca = i % 10 === 9 ? "-caida" : i % 13 === 12 ? "-robots" : "";
      return { nombre, dominio: `${slug(nombre)}${marca}.example`, ciudad: region, origen: `osm:node/${(h % 100000) * 100 + i}` };
    });
  }
}

export class DeterministicWebReader implements WebReader {
  constructor(private readonly reloj: Reloj) {}

  async leer(dominio: string): Promise<LecturaWeb> {
    if (dominio.includes("caida")) return { ok: false, motivo: "La web no responde (tiempo agotado a los 10 s)." };
    if (dominio.includes("robots")) return { ok: false, motivo: "Su robots.txt no permite el rastreo a JanoBot." };
    const leidaEn = this.reloj.ahora().toISOString();
    const paginas = [
      {
        url: `https://${dominio}/`,
        titulo: dominio,
        texto: `Agencia de viajes con oficina propia. Viajes de empresa, grupos y eventos para clientes de la zona. Más información en ${dominio}.`,
        leidaEn,
      },
    ];
    if (huella(dominio) % 3 === 0) {
      paginas.push({
        url: `https://${dominio}/empleo`,
        titulo: "Empleo",
        texto: "Buscamos responsable comercial para el área de empresas. Publicado el 1 de octubre de 2026.",
        leidaEn,
      });
    }
    return { ok: true, paginas };
  }
}
