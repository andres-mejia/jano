import type { RepositorioConsumo } from "../../ports/repositorios";
import type { Tx } from "./tx";

/**
 * Llamadas al modelo por tenant y día (spec 008 FR-016). La reserva es un único
 * upsert condicionado: dos llamadas a la vez no pasan las dos del tope.
 */
export function repositorioConsumo(tx: Tx, tenantId: string): RepositorioConsumo {
  const t = { t: tenantId };
  return {
    async reservarLlamada(dia, tope) {
      const filas = await tx.query<{ calls: unknown }>(
        `insert into ai_usage (tenant_id, day, calls) values (:t, cast(:dia as date), 1)
         on conflict (tenant_id, day) do update set calls = ai_usage.calls + 1 where ai_usage.calls < :tope
         returning calls`,
        { ...t, dia, tope },
      );
      return filas.length > 0;
    },

    async anotar(dia, uso) {
      await tx.query(
        `update ai_usage set input_tokens = input_tokens + :entrada, output_tokens = output_tokens + :salida,
           cost_usd = cost_usd + cast(:coste as numeric)
         where tenant_id = :t and day = cast(:dia as date)`,
        { ...t, dia, entrada: uso.tokensEntrada, salida: uso.tokensSalida, coste: uso.costeUsd.toFixed(6) },
      );
    },
  };
}
