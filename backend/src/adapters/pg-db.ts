import pg from "pg";

import type { Db, UnidadDeTrabajo } from "../ports/db";
import { FIJAR_TENANT, type Parametros, type Tx } from "./sql/tx";
import { agendaDelMotor, crearUnidad, ejecutarEfectos, resolverToken } from "./sql/unidad";

/** `:nombre` → `$n` sin tocar los `::` de los casts. */
export function aPosicionales(sql: string, params: Parametros = {}): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const indices = new Map<string, number>();
  const text = sql.replace(/(?<![:\w]):([a-zA-Z_]\w*)/g, (_, nombre: string) => {
    if (!(nombre in params)) throw new Error(`parámetro sin valor: ${nombre}`);
    let i = indices.get(nombre);
    if (i === undefined) {
      values.push(params[nombre]);
      i = values.length;
      indices.set(nombre, i);
    }
    return `$${i}`;
  });
  return { text, values };
}

/** Adaptador para tests y local, con la misma semántica que `DataApiDb`. */
export class PgDb implements Db {
  constructor(private readonly pool: pg.Pool) {}

  /** Una transacción; `preparar` fija la sesión (tenant o token) antes que nada. */
  private async transaccion<T>(preparar: (tx: Tx) => Promise<unknown>, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("begin");
      const tx: Tx = {
        async query<R>(sql: string, params?: Parametros) {
          const { text, values } = aPosicionales(sql, params);
          return (await cliente.query(text, values)).rows as R[];
        },
      };
      await preparar(tx);
      const r = await fn(tx);
      await cliente.query("commit");
      return r;
    } catch (e) {
      await cliente.query("rollback");
      throw e;
    } finally {
      cliente.release();
    }
  }

  enTenantSql<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.transaccion((tx) => tx.query(FIJAR_TENANT, { tenant_id: tenantId }), fn);
  }

  async enTenant<T>(tenantId: string, fn: (uow: UnidadDeTrabajo) => Promise<T>): Promise<T> {
    let efectos: (() => Promise<void>)[] = [];
    const r = await this.enTenantSql(tenantId, (tx) => {
      const u = crearUnidad(tx, tenantId);
      efectos = u.efectos;
      return fn(u.uow);
    });
    await ejecutarEfectos(efectos);
    return r;
  }

  agendaDelMotor(ahora: Date) {
    return this.transaccion(async () => {}, (tx) => agendaDelMotor(tx, ahora));
  }

  resolverToken(token: string) {
    return this.transaccion(async () => {}, (tx) => resolverToken(tx, token));
  }
}
