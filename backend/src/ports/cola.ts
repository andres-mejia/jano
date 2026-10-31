import type { EmpresaCandidata } from "./web";

/**
 * Cola de análisis de cuentas (spec 008, Account Finder en segundo plano): leer
 * webs y puntuar no cabe en los 29 s de una petición a la API. La API encola y el
 * trabajador `jano-<env>-cuentas` consume: una búsqueda por región encola después
 * un mensaje por candidata. El tenant viaja en el mensaje porque lo escribe la API
 * desde el claim del JWT, nunca desde el cuerpo de una petición.
 */
export type MensajeCuentas =
  | {
      readonly tipo: "region";
      readonly tenantId: string;
      readonly campaignId: string;
      readonly jobId: string;
      readonly region: string;
    }
  | {
      readonly tipo: "cuenta";
      readonly tenantId: string;
      readonly campaignId: string;
      readonly jobId: string;
      readonly empresa: EmpresaCandidata;
    };

export interface ColaDeCuentas {
  encolar(mensajes: readonly MensajeCuentas[]): Promise<void>;
}
