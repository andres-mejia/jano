import type { UnidadDeTrabajo } from "../../ports/db";
import { repositorioBandeja } from "./bandeja";
import { repositorioCampanas } from "./campanas";
import { repositorioConsumo } from "./consumo";
import { repositorioCuentas } from "./cuentas";
import { repositorioCumplimiento } from "./cumplimiento";
import { registroDeEventos } from "./eventos";
import { repositorioEquipo } from "./repositorio-equipo";
import { repositorioProspects } from "./prospects";
import { FIJAR_TOKEN, type Tx } from "./tx";
import { proyecciones } from "./vistas";

/**
 * La unidad de trabajo de una transacción de tenant, igual en Data API y en pg.
 * Los efectos de `alConfirmar` los ejecuta el adaptador después del commit.
 */
export function crearUnidad(tx: Tx, tenantId: string): { uow: UnidadDeTrabajo; efectos: (() => Promise<void>)[] } {
  const efectos: (() => Promise<void>)[] = [];
  const uow: UnidadDeTrabajo = {
    equipo: repositorioEquipo(tx, tenantId),
    campanas: repositorioCampanas(tx, tenantId),
    cuentas: repositorioCuentas(tx, tenantId),
    prospects: repositorioProspects(tx, tenantId),
    eventos: registroDeEventos(tx, tenantId),
    bandeja: repositorioBandeja(tx, tenantId),
    cumplimiento: repositorioCumplimiento(tx, tenantId),
    consumo: repositorioConsumo(tx, tenantId),
    vistas: proyecciones(tx, tenantId),
    alConfirmar: (fn) => efectos.push(fn),
  };
  return { uow, efectos };
}

/** Tras el commit: un efecto que falla se registra y no deshace nada (el motor tiene su red de seguridad). */
export async function ejecutarEfectos(efectos: readonly (() => Promise<void>)[]): Promise<void> {
  for (const fn of efectos) {
    try {
      await fn();
    } catch (e) {
      console.warn(JSON.stringify({ msg: "efecto_tras_commit_fallido", error: e instanceof Error ? e.message : String(e) }));
    }
  }
}

/** Agenda del motor con el rol jano_motor: solo tenant, estado y fecha de los pasos. */
export async function agendaDelMotor(tx: Tx, ahora: Date): Promise<{ vencidos: string[]; proximo: Date | null }> {
  await tx.query("set local role jano_motor");
  const vencidos = await tx.query<{ tenant_id: string }>(
    "select distinct tenant_id from sequence_steps where status = 'planned' and scheduled_for <= cast(:ahora as timestamptz) order by tenant_id",
    { ahora: ahora.toISOString() },
  );
  const [p] = await tx.query<{ proximo: unknown }>(
    "select (extract(epoch from min(scheduled_for)) * 1000)::bigint as proximo from sequence_steps where status = 'planned' and scheduled_for is not null",
  );
  return {
    vencidos: vencidos.map((v) => v.tenant_id),
    proximo: p?.proximo === null || p?.proximo === undefined ? null : new Date(Number(p.proximo)),
  };
}

/** Token opaco → tenant y prospect, con la política por_token (solo esa fila). */
export async function resolverToken(tx: Tx, token: string): Promise<{ tenantId: string; prospectId: string } | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  await tx.query(FIJAR_TOKEN, { token });
  const [f] = await tx.query<{ tenant_id: string; id: string }>("select tenant_id, id from prospects where token = :token", { token });
  return f ? { tenantId: f.tenant_id, prospectId: f.id } : null;
}
