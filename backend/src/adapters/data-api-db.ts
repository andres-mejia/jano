import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";

import type { Db, UnidadDeTrabajo } from "../ports/db";
import { FIJAR_TENANT, type Parametros, type Tx } from "./sql/tx";
import { agendaDelMotor, crearUnidad, ejecutarEfectos, resolverToken } from "./sql/unidad";

export interface ConfigDataApi {
  readonly clusterArn: string;
  readonly secretArn: string;
  readonly database: string;
}

const aParametro = (name: string, v: Parametros[string]): SqlParameter => {
  if (v === null) return { name, value: { isNull: true } };
  if (typeof v === "boolean") return { name, value: { booleanValue: v } };
  if (typeof v === "number") return Number.isInteger(v) ? { name, value: { longValue: v } } : { name, value: { doubleValue: v } };
  return { name, value: { stringValue: v } };
};

/**
 * Aurora por Data API. Fuera de una transacción Data API no conserva la sesión,
 * así que `app.tenant_id` solo es fiable con `set_config(..., true)` dentro de
 * Begin/Commit (research §2). Con Aurora en pausa, la primera llamada devuelve
 * `DatabaseResumingException`: se reintenta unos segundos, como Fenora.
 */
export class DataApiDb implements Db {
  constructor(
    private readonly config: ConfigDataApi,
    private readonly cliente = new RDSDataClient({}),
    private readonly esperasMs: readonly number[] = [1000, 2000, 4000, 8000, 8000],
  ) {}

  private async conReintento<T>(fn: () => Promise<T>): Promise<T> {
    for (let intento = 0; ; intento++) {
      try {
        return await fn();
      } catch (e) {
        const espera = this.esperasMs[intento];
        if ((e as { name?: string }).name !== "DatabaseResumingException" || espera === undefined) throw e;
        console.warn(JSON.stringify({ msg: "aurora_reanudando", intento: intento + 1, esperaMs: espera }));
        await new Promise((r) => setTimeout(r, espera));
      }
    }
  }

  /** Una transacción de Data API; `preparar` fija la sesión (tenant o token) antes que nada. */
  private async transaccion<T>(preparar: (tx: Tx) => Promise<unknown>, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const { clusterArn: resourceArn, secretArn, database } = this.config;
    const { transactionId } = await this.conReintento(() =>
      this.cliente.send(new BeginTransactionCommand({ resourceArn, secretArn, database })),
    );
    const tx: Tx = {
      query: async <R>(sql: string, params: Parametros = {}) => {
        const out = await this.cliente.send(
          new ExecuteStatementCommand({
            resourceArn,
            secretArn,
            database,
            transactionId,
            sql,
            parameters: Object.entries(params).map(([n, v]) => aParametro(n, v)),
            formatRecordsAs: "JSON",
          }),
        );
        return (out.formattedRecords ? JSON.parse(out.formattedRecords) : []) as R[];
      },
    };
    try {
      await preparar(tx);
      const r = await fn(tx);
      await this.cliente.send(new CommitTransactionCommand({ resourceArn, secretArn, transactionId }));
      return r;
    } catch (e) {
      await this.cliente.send(new RollbackTransactionCommand({ resourceArn, secretArn, transactionId })).catch(() => {});
      throw e;
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
