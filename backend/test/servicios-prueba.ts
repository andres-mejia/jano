import type { Servicios } from "../src/application/servicios";
import { DeterministicMailSender } from "../src/adapters/deterministas/correo";
import { agentesDeterministas } from "../src/adapters/deterministas/ia";
import { DespertadorEnMemoria, relojDelSistema } from "../src/adapters/deterministas/reloj";
import { DeterministicCompanySource, DeterministicWebReader } from "../src/adapters/deterministas/web";
import { crearListaBlanca } from "../src/domain/motor/lista-blanca";
import type { Agentes } from "../src/ports/ia";
import type { Reloj } from "../src/ports/reloj";

/** Lista blanca de pruebas: direcciones inventadas en dominios `.example`. */
export const LISTA_BLANCA = "demo.jano@correo.example";

/**
 * Servicios del motor para tests: adaptadores deterministas (infraestructura), el
 * dominio real. Devuelve también el correo y el despertador para inspeccionarlos.
 */
export function serviciosDePrueba(opciones: { reloj?: Reloj; minutosPorDia?: number; agentes?: Partial<Agentes>; lista?: string | null } = {}) {
  const correo = new DeterministicMailSender();
  const despertador = new DespertadorEnMemoria();
  const reloj = opciones.reloj ?? relojDelSistema;
  const lista = opciones.lista === undefined ? LISTA_BLANCA : opciones.lista;
  const servicios: Servicios = {
    agentes: { ...agentesDeterministas(), ...opciones.agentes },
    correo,
    web: new DeterministicWebReader(reloj),
    empresas: new DeterministicCompanySource(),
    reloj,
    despertador,
    config: {
      listaBlanca: lista === null ? null : crearListaBlanca(lista),
      minutosPorDia: opciones.minutosPorDia ?? 1440,
      conexiones: [{ kind: "crm", name: "CRM o Excel", detail: "Exportación a Excel (CSV)", status: "connected", lastCheckedAt: null }],
    },
  };
  return { servicios, correo, despertador };
}
