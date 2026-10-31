import type { Db } from "../ports/db";
import { conTenant } from "./contexto-tenant";
import { procesarVencidos } from "./motor";
import type { Servicios } from "./servicios";

/**
 * Una pasada del motor (ADR-003, spec 008 FR-004), cada minuto desde EventBridge
 * Scheduler. Primero el despertador, fuera de Aurora: si nada vence, termina sin
 * despertar la base de datos. Si algo vence, descubre los tenants con trabajo (rol
 * jano_motor) y procesa como mucho `lote` pasos, cada tenant en su transacción con
 * `FOR UPDATE SKIP LOCKED`. Idempotente: un paso procesado sale de `planned` o
 * cambia de fecha en la misma transacción, así que otra pasada no lo repite.
 */

export const LOTE = 50;
/** Red de seguridad del despertador: como mucho tantas horas sin mirar la base de datos. */
export const REVISION_MAXIMA_MS = 6 * 3_600_000;

export type Pasada =
  | { readonly salida: "nada_vencido"; readonly procesados: 0 }
  | { readonly salida: "procesado"; readonly procesados: number; readonly tenants: number; readonly proximo: string | null };

export async function ejecutarMotor(db: Db, s: Servicios, lote = LOTE): Promise<Pasada> {
  const ahora = s.reloj.ahora();
  const antes = await s.despertador.leer();
  if (antes && (!antes.proximo || antes.proximo > ahora) && ahora.getTime() - antes.revisadoEn.getTime() < REVISION_MAXIMA_MS) {
    return { salida: "nada_vencido", procesados: 0 };
  }

  const agenda = await db.agendaDelMotor(ahora);
  let procesados = 0;
  let tenants = 0;
  for (const tenantId of agenda.vencidos) {
    if (procesados >= lote) break;
    const r = await conTenant(tenantId, () =>
      db.enTenant(tenantId, async (uow) => {
        // Un tenant suspendido no opera: sus pasos esperan a que se reactive.
        if ((await uow.equipo.tenant())?.status !== "active") return { procesados: 0 };
        return procesarVencidos(uow, s, lote - procesados);
      }),
    );
    procesados += r.procesados;
    tenants++;
    console.log(JSON.stringify({ msg: "motor_tenant", tenant_id: tenantId, procesados: r.procesados }));
  }

  // Próxima revisión: ya, si quedó trabajo por el tope del lote; si no, el próximo paso.
  const despues = await db.agendaDelMotor(s.reloj.ahora());
  let proximo = despues.vencidos.length ? s.reloj.ahora() : despues.proximo;
  // Si la API adelantó el despertador mientras tanto, gana la fecha más temprana.
  const ahoraLeido = await s.despertador.leer();
  if (ahoraLeido?.proximo && ahoraLeido.proximo.getTime() !== antes?.proximo?.getTime()) {
    proximo = proximo && proximo < ahoraLeido.proximo ? proximo : ahoraLeido.proximo;
  }
  await s.despertador.fijar({ proximo, revisadoEn: ahora });
  return { salida: "procesado", procesados, tenants, proximo: proximo?.toISOString() ?? null };
}
