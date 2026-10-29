import type { Db } from "../../ports/db";
import type { TopeDeLlamadas } from "./modelo";

/**
 * Tope diario y uso del modelo en `ai_usage` (spec 008 FR-016), cada uno en su
 * transacción corta del tenant. Va aparte de la transacción de la petición: una
 * llamada hecha cuenta aunque la petición acabe deshaciéndose, porque se ha pagado.
 */
export class TopeEnPostgres implements TopeDeLlamadas {
  constructor(private readonly db: Db) {}

  reservar(tenantId: string, dia: string, tope: number): Promise<boolean> {
    return this.db.enTenant(tenantId, (uow) => uow.consumo.reservarLlamada(dia, tope));
  }

  anotar(tenantId: string, dia: string, uso: { tokensEntrada: number; tokensSalida: number; costeUsd: number }): Promise<void> {
    return this.db.enTenant(tenantId, (uow) => uow.consumo.anotar(dia, uso));
  }
}
