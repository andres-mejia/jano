import { randomBytes } from "node:crypto";

import pg from "pg";

import { PgDb } from "../src/adapters/pg-db";
import { type Ejecutor, migrar, prepararRolApi } from "../scripts/lib/migraciones";

/**
 * Base de datos de pruebas: una base nueva por fichero de tests en el Postgres de
 * `con-postgres.mjs`, con las migraciones reales. `db` entra como `jano_api`, igual
 * que la Lambda; `admin` es el propietario (para preparar datos de otro tenant).
 */
const PASSWORD_API = "pruebasjanoapi0123456789";

export function ejecutorPg(pool: pg.Pool): Ejecutor {
  return {
    async transaccion(fn) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        await fn(async (sql) => (await c.query(sql)).rows);
        await c.query("commit");
      } catch (e) {
        await c.query("rollback");
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

export interface BaseDePruebas {
  readonly db: PgDb;
  readonly admin: PgDb;
  readonly apiPool: pg.Pool;
  cerrar(): Promise<void>;
}

export async function baseDePruebas(): Promise<BaseDePruebas> {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL no definida: ejecuta los tests con `pnpm --filter @jano/backend test`");
  const nombre = `t_${randomBytes(6).toString("hex")}`;

  const raiz = new pg.Pool({ connectionString: url, max: 1 });
  await raiz.query(`create database ${nombre}`);
  await raiz.end();

  const urlBase = new URL(url);
  urlBase.pathname = `/${nombre}`;
  const adminPool = new pg.Pool({ connectionString: urlBase.toString(), max: 2 });
  await migrar(ejecutorPg(adminPool));
  await prepararRolApi(ejecutorPg(adminPool), PASSWORD_API);

  const urlApi = new URL(urlBase);
  urlApi.username = "jano_api";
  urlApi.password = PASSWORD_API;
  const apiPool = new pg.Pool({ connectionString: urlApi.toString(), max: 2 });

  return {
    db: new PgDb(apiPool),
    admin: new PgDb(adminPool),
    apiPool,
    async cerrar() {
      await apiPool.end();
      await adminPool.end();
    },
  };
}
