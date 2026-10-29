import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { dividirSentencias, migrar } from "../scripts/lib/migraciones";
import { type BaseDePruebas, baseDePruebas, ejecutorPg } from "./pg";

let base: BaseDePruebas;
before(async () => {
  base = await baseDePruebas();
});
after(() => base.cerrar());

test("dividirSentencias respeta los bloques $$ y las cadenas", () => {
  const s = dividirSentencias("-- comentario\nDO $$ BEGIN PERFORM 1; END $$;\nselect ';' as x;\ncreate table t (a int);");
  assert.equal(s.length, 3);
  assert.match(s[0] ?? "", /^DO \$\$ BEGIN PERFORM 1; END \$\$$/);
  assert.equal(s[1], "select ';' as x");
});


test("jano_api no se salta RLS ni es propietario", async () => {
  const filas = await base.admin.enTenantSql("tenant-x", (tx) =>
    tx.query<{ rolbypassrls: boolean; rolsuper: boolean }>("select rolbypassrls, rolsuper from pg_roles where rolname = 'jano_api'"),
  );
  assert.deepEqual(filas, [{ rolbypassrls: false, rolsuper: false }]);
  const propias = await base.admin.enTenantSql("tenant-x", (tx) => tx.query("select 1 from pg_tables where tableowner = 'jano_api'"));
  assert.equal(propias.length, 0);
});

test("todas las tablas de negocio tienen RLS forzado", async () => {
  const filas = await base.admin.enTenantSql("tenant-x", (tx) =>
    tx.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname, relrowsecurity, relforcerowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' and relname <> 'schema_migrations' order by relname`,
    ),
  );
  assert.deepEqual(
    filas.map((f) => f.relname),
    [
      "accounts",
      "campaign_reviews",
      "campaigns",
      "contacts",
      "guardrails",
      "icp_turns",
      "inbox_items",
      "opportunities",
      "prospect_events",
      "prospects",
      "sequence_steps",
      "suppression_list",
      "tenant_users",
      "tenants",
      "user_activity",
    ],
  );
  for (const f of filas) assert.ok(f.relrowsecurity && f.relforcerowsecurity, `${f.relname} sin RLS forzado`);
});

test("migrar dos veces no vuelve a aplicar nada", async () => {
  const { Pool } = await import("pg");
  const url = new URL(process.env["DATABASE_URL"] ?? "");
  const dbName = (await base.admin.enTenantSql("tenant-x", (tx) => tx.query<{ d: string }>("select current_database() as d")))[0]?.d;
  url.pathname = `/${dbName}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  try {
    assert.deepEqual(await migrar(ejecutorPg(pool)), []);
  } finally {
    await pool.end();
  }
});
