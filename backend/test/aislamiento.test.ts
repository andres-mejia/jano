import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { A, B, sembrarMotor, sembrarTenant, TABLAS_MOTOR } from "./semilla";
import { type BaseDePruebas, baseDePruebas } from "./pg";

/**
 * Batería de aislamiento (SC-004, US4; spec 008 T011 la amplía a las tablas del
 * motor): con el rol de la API, ninguna consulta ve ni toca filas de otro tenant,
 * aunque no filtre por tenant_id.
 */
let base: BaseDePruebas;
let motorB: Awaited<ReturnType<typeof sembrarMotor>>;
before(async () => {
  base = await baseDePruebas();
  await sembrarTenant(base.admin, A, [{ email: "alba@faro.example", role: "member", status: "active" }]);
  await sembrarTenant(base.admin, B, [{ email: "berta@brisa.example", role: "member", status: "invited" }]);
  await base.admin.enTenantSql(B.id, (tx) =>
    tx.query("insert into user_activity (tenant_id, actor, action) values (:t, 'ops', 'tenant_created')", { t: B.id }),
  );
  await sembrarMotor(base.admin, A.id, "faro.example");
  motorB = await sembrarMotor(base.admin, B.id, "brisa.example");
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

// ── Tablas del motor (002) ─────────────────────────────────────────────────

test("motor: cada tabla, leída sin filtro, solo muestra el tenant de la transacción", async () => {
  for (const tabla of TABLAS_MOTOR) {
    const filas = await base.db.enTenantSql(A.id, (tx) => tx.query<{ tenant_id: string }>(`select tenant_id from ${tabla}`));
    assert.equal(filas.length, 1, tabla);
    assert.ok(filas.every((f) => f.tenant_id === A.id), tabla);
    assert.equal(await contar(A.id, `select * from ${tabla} where tenant_id = '${B.id}'`), 0, tabla);
  }
});

test("motor: un update sin filtro no alcanza al otro tenant", async () => {
  await base.db.enTenantSql(A.id, (tx) => tx.query("update campaigns set name = 'cambiada'"));
  await base.db.enTenantSql(A.id, (tx) => tx.query("update sequence_steps set status = 'skipped'"));
  const [c] = await base.admin.enTenantSql(B.id, (tx) => tx.query<{ name: string }>("select name from campaigns where tenant_id = :t", { t: B.id }));
  const [s] = await base.admin.enTenantSql(B.id, (tx) =>
    tx.query<{ status: string }>("select status from sequence_steps where tenant_id = :t", { t: B.id }),
  );
  assert.equal(c?.name, "Agencias");
  assert.equal(s?.status, "planned");
});

test("motor: no se puede escribir en otro tenant aunque se conozcan sus ids", async () => {
  const intentos = [
    "insert into campaigns (tenant_id, name, prompt, icp, meetings_goal) values (:t, 'x', 'x', '{}', 1)",
    "insert into icp_turns (tenant_id, campaign_id, role, text) values (:t, cast(:c as uuid), 'user', 'x')",
    "insert into accounts (tenant_id, campaign_id, name, domain, fit_score, fit_reasoning, status, source) values (:t, cast(:c as uuid), 'x', 'x.example', 1, 'x', 'found', 'manual')",
    "insert into prospect_events (tenant_id, prospect_id, campaign_id, agent, type, summary) values (:t, cast(:p as uuid), cast(:c as uuid), 'human', 'decision', 'x')",
    "insert into suppression_list (tenant_id, email, source) values (:t, 'x@brisa.example', 'manual')",
    "insert into guardrails (tenant_id) values (:t)",
  ];
  for (const sql of intentos) {
    await assert.rejects(
      base.db.enTenantSql(A.id, (tx) => tx.query(sql, { t: B.id, c: motorB.campaign, p: motorB.prospect })),
      /row-level security|violates foreign key|is not present/,
      sql,
    );
  }
});

test("motor: sin tenant en la sesión no se ve nada", async () => {
  const c = await base.apiPool.connect();
  try {
    for (const tabla of TABLAS_MOTOR) assert.equal((await c.query(`select * from ${tabla}`)).rowCount, 0, tabla);
  } finally {
    c.release();
  }
});

test("motor: la API no borra nada y el registro, los turnos y la supresión son append-only", async () => {
  for (const tabla of TABLAS_MOTOR) {
    await assert.rejects(base.db.enTenantSql(A.id, (tx) => tx.query(`delete from ${tabla}`)), /permission denied/, tabla);
  }
  for (const sql of [
    "update prospect_events set summary = 'reescrito'",
    "update icp_turns set text = 'x'",
    "update suppression_list set email = 'x@faro.example'",
    "update campaign_reviews set reading = 'x'",
  ]) {
    await assert.rejects(base.db.enTenantSql(A.id, (tx) => tx.query(sql)), /permission denied/, sql);
  }
});

test("jano_motor: descubre pasos de todos los tenants, pero solo tenant, estado y fecha", async () => {
  const tenants = await base.db.enTenantSql(A.id, async (tx) => {
    await tx.query("set local role jano_motor");
    return tx.query<{ tenant_id: string }>("select distinct tenant_id from sequence_steps where status = 'planned' order by 1");
  });
  assert.deepEqual(tenants.map((t) => t.tenant_id), [B.id]); // el de A quedó skipped en el test de update
  await assert.rejects(
    base.db.enTenantSql(A.id, async (tx) => {
      await tx.query("set local role jano_motor");
      return tx.query("select body from sequence_steps");
    }),
    /permission denied/,
  );
  await assert.rejects(
    base.db.enTenantSql(A.id, async (tx) => {
      await tx.query("set local role jano_motor");
      return tx.query("select * from prospects");
    }),
    /permission denied/,
  );
});

test("jano_api sin SET ROLE no hereda la vista del motor", async () => {
  const filas = await base.db.enTenantSql(A.id, (tx) => tx.query<{ tenant_id: string }>("select tenant_id from sequence_steps"));
  assert.ok(filas.every((f) => f.tenant_id === A.id));
});

test("el token de un prospect deja ver ese prospect y nada más", async () => {
  const c = await base.apiPool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.token', $1, true)", [motorB.token]);
    const p = await c.query("select id, tenant_id from prospects");
    assert.deepEqual(p.rows, [{ id: motorB.prospect, tenant_id: B.id }]);
    for (const tabla of TABLAS_MOTOR.filter((t) => t !== "prospects")) {
      assert.equal((await c.query(`select * from ${tabla}`)).rowCount, 0, tabla);
    }
    // Ver no es escribir: por_token es solo de lectura.
    assert.equal((await c.query("update prospects set stage = 'discarded'")).rowCount, 0);
    await c.query("rollback");
  } finally {
    c.release();
  }
});
