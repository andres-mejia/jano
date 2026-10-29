import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { A, B, sembrarTenant } from "./semilla";
import { type BaseDePruebas, baseDePruebas } from "./pg";

/**
 * Batería de aislamiento (SC-004, US4): con el rol de la API, ninguna consulta ve
 * ni toca filas de otro tenant, aunque no filtre por tenant_id.
 */
let base: BaseDePruebas;
before(async () => {
  base = await baseDePruebas();
  await sembrarTenant(base.admin, A, [{ email: "alba@faro.example", role: "member", status: "active" }]);
  await sembrarTenant(base.admin, B, [{ email: "berta@brisa.example", role: "member", status: "invited" }]);
  await base.admin.enTenantSql(B.id, (tx) =>
    tx.query("insert into user_activity (tenant_id, actor, action) values (:t, 'ops', 'tenant_created')", { t: B.id }),
  );
});
after(() => base.cerrar());

const contar = (tenant: string, sql: string) =>
  base.db.enTenantSql(tenant, async (tx) => (await tx.query(sql)).length);

test("las lecturas sin filtro solo ven el tenant de la transacción", async () => {
  assert.equal(await contar(A.id, "select * from tenants"), 1);
  assert.equal(await contar(A.id, "select * from tenant_users"), 2);
  assert.equal(await contar(A.id, "select * from user_activity"), 0);
  const emails = await base.db.enTenantSql(A.id, (tx) => tx.query<{ email: string }>("select email from tenant_users"));
  assert.ok(emails.every((e) => e.email.endsWith("@faro.example")));
});

test("buscar explícitamente filas de otro tenant devuelve cero", async () => {
  assert.equal(await contar(A.id, `select * from tenant_users where tenant_id = '${B.id}'`), 0);
  assert.equal(await contar(A.id, `select * from tenants where id = '${B.id}'`), 0);
  assert.equal(await contar(A.id, `select * from user_activity where tenant_id = '${B.id}'`), 0);
});

test("un update sin filtro solo cambia el tenant de la transacción", async () => {
  await base.db.enTenantSql(A.id, (tx) => tx.query("update tenant_users set name = 'cambiado'"));
  const deB = await base.admin.enTenantSql(B.id, (tx) => tx.query<{ name: string | null }>("select name from tenant_users where tenant_id = :t", { t: B.id }));
  assert.ok(deB.every((u) => u.name === null));
});

test("no se puede escribir en otro tenant", async () => {
  await assert.rejects(
    base.db.enTenantSql(A.id, (tx) =>
      tx.query("insert into tenant_users (tenant_id, user_id, email, role, status) values (:t, 'x', 'x@brisa.example', 'member', 'invited')", { t: B.id }),
    ),
    /row-level security/,
  );
  await assert.rejects(
    base.db.enTenantSql(A.id, (tx) => tx.query("insert into user_activity (tenant_id, actor, action) values (:t, 'x', 'user_invited')", { t: B.id })),
    /row-level security/,
  );
});

test("sin tenant en la sesión no se ve nada", async () => {
  const c = await base.apiPool.connect();
  try {
    for (const tabla of ["tenants", "tenant_users", "user_activity"]) {
      assert.equal((await c.query(`select * from ${tabla}`)).rowCount, 0, tabla);
    }
  } finally {
    c.release();
  }
});

test("la API no puede borrar ni reescribir la actividad", async () => {
  await assert.rejects(base.db.enTenantSql(A.id, (tx) => tx.query("delete from tenant_users")), /permission denied/);
  await assert.rejects(base.db.enTenantSql(A.id, (tx) => tx.query("update user_activity set actor = 'x'")), /permission denied/);
  await assert.rejects(base.db.enTenantSql(A.id, (tx) => tx.query("update tenants set name = 'x'")), /permission denied/);
});
