import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Migraciones SQL numeradas (`migrations/NNN_nombre.sql`), aplicadas en orden y una
 * sola vez, cada una en su transacción. Las aplica `scripts/migrar.ts` (Data API, en
 * dev y CI) o los tests (pg); nunca una Lambda al arrancar (spec 003 FR-003).
 */

export type Consulta = (sql: string) => Promise<Record<string, unknown>[]>;

export interface Ejecutor {
  transaccion(fn: (q: Consulta) => Promise<void>): Promise<void>;
}

export const DIR_MIGRACIONES = new URL("../../migrations/", import.meta.url).pathname;

/** Data API ejecuta una sentencia por llamada: se parte por `;` fuera de bloques `$$` y de cadenas. */
export function dividirSentencias(sql: string): string[] {
  const sentencias: string[] = [];
  let actual = "";
  let enDolar = false;
  let enCadena = false;
  for (const linea of sql.split("\n")) {
    if (!enDolar && !enCadena && /^\s*--/.test(linea)) continue;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (!enCadena && linea.startsWith("$$", i)) {
        enDolar = !enDolar;
        actual += "$$";
        i++;
        continue;
      }
      if (!enDolar && c === "'") enCadena = !enCadena;
      if (c === ";" && !enDolar && !enCadena) {
        if (actual.trim()) sentencias.push(actual.trim());
        actual = "";
        continue;
      }
      actual += c;
    }
    actual += "\n";
  }
  if (actual.trim()) sentencias.push(actual.trim());
  return sentencias;
}

export async function migrar(ejecutor: Ejecutor, dir = DIR_MIGRACIONES): Promise<string[]> {
  await ejecutor.transaccion(async (q) => {
    await q("create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())");
  });

  const ficheros = (await readdir(dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  const aplicadas: string[] = [];
  for (const fichero of ficheros) {
    const version = fichero.slice(0, 3);
    await ejecutor.transaccion(async (q) => {
      const ya = await q(`select 1 from schema_migrations where version = '${version}'`);
      if (ya.length) return;
      for (const s of dividirSentencias(await readFile(join(dir, fichero), "utf8"))) await q(s);
      await q(`insert into schema_migrations (version) values ('${version}')`);
      aplicadas.push(fichero);
    });
  }
  return aplicadas;
}

/**
 * Contraseña del rol de la API y comprobación de que no se salta RLS: sin
 * `BYPASSRLS` y sin ser propietario de ninguna tabla (research §2).
 */
export async function prepararRolApi(ejecutor: Ejecutor, password: string): Promise<void> {
  if (!/^[A-Za-z0-9]{24,}$/.test(password)) throw new Error("la contraseña de jano_api debe ser alfanumérica y de 24+ caracteres");
  await ejecutor.transaccion(async (q) => {
    await q(`alter role jano_api with login nobypassrls password '${password}'`);
    const [rol] = await q("select rolbypassrls, rolsuper from pg_roles where rolname = 'jano_api'");
    if (!rol || rol["rolbypassrls"] !== false || rol["rolsuper"] !== false) throw new Error("jano_api no debe tener BYPASSRLS ni ser superusuario");
    const propias = await q("select tablename from pg_tables where tableowner = 'jano_api'");
    if (propias.length) throw new Error("jano_api no debe ser propietario de tablas");
  });
}
