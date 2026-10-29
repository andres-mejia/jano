import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { altaTenant, cambiarSuspension, importarTenant } from "../src/application/operaciones";
import { DirectorioEnMemoria } from "./directorio-memoria";
import { type BaseDePruebas, baseDePruebas } from "./pg";

/** Operaciones de `ops` (US1, US5) con el propietario, como los scripts con el usuario maestro. */
let base: BaseDePruebas;
before(async () => {
  base = await baseDePruebas();
});
after(() => base.cerrar());

test("alta: crea el tenant y su owner invitado, y lo registra", async () => {
  const d = new DirectorioEnMemoria();
  const { ownerId } = await base.admin.enTenant("tenant-faro", (uow) =>
    altaTenant(uow, d, { tenantId: "tenant-faro", nombre: "Faro Ingeniería", owner: "Ana@Faro.example", nombreOwner: "Ana" }),
  );
  assert.equal(d.usuarios.get("ana@faro.example")?.role, "owner");
  const equipo = await base.admin.enTenant("tenant-faro", (uow) => uow.equipo.listar());
  assert.deepEqual(equipo.map((u) => [u.userId, u.role, u.status]), [[ownerId, "owner", "invited"]]);
  const act = await base.admin.enTenantSql("tenant-faro", (tx) => tx.query<{ action: string }>("select action from user_activity order by id"));
  assert.deepEqual(act.map((a) => a.action), ["tenant_created", "user_invited"]);
});

test("alta: si el email ya existe no se crea nada", async () => {
  const d = new DirectorioEnMemoria();
  await d.invitar({ email: "ya@otra.example", name: null, tenantId: "tenant-otra", role: "member" });
  await assert.rejects(
    base.admin.enTenant("tenant-nueva", (uow) =>
      altaTenant(uow, d, { tenantId: "tenant-nueva", nombre: "Nueva", owner: "ya@otra.example", nombreOwner: null }),
    ),
    /ya es usuario de Jano/,
  );
  assert.equal((await base.admin.enTenant("tenant-nueva", (uow) => uow.equipo.tenant())), null);
});

test("alta: id de tenant no válido", async () => {
  await assert.rejects(
    base.admin.enTenant("Faro", (uow) => altaTenant(uow, new DirectorioEnMemoria(), { tenantId: "Faro", nombre: "x", owner: "a@b.example", nombreOwner: null })),
    /no válidos: tenantId/,
  );
});

test("importar: trae los usuarios de Cognito una sola vez", async () => {
  const d = new DirectorioEnMemoria();
  await d.invitar({ email: "piloto@rumbo.example", name: null, tenantId: "tenant-rumbo", role: "owner" });
  await d.invitar({ email: "otro@rumbo.example", name: null, tenantId: "tenant-rumbo", role: "member" });
  await d.invitar({ email: "ajeno@otra.example", name: null, tenantId: "tenant-otra", role: "member" });
  const piloto = d.usuarios.get("piloto@rumbo.example");
  if (piloto) d.usuarios.set("piloto@rumbo.example", { ...piloto, confirmado: true });

  const r1 = await base.admin.enTenant("tenant-rumbo", (uow) => importarTenant(uow, d, { tenantId: "tenant-rumbo", nombre: "Rumbo" }));
  assert.deepEqual(r1.importados.sort(), ["otro@rumbo.example", "piloto@rumbo.example"]);
  const r2 = await base.admin.enTenant("tenant-rumbo", (uow) => importarTenant(uow, d, { tenantId: "tenant-rumbo", nombre: "Rumbo" }));
  assert.deepEqual(r2.importados, []);

  const equipo = await base.admin.enTenant("tenant-rumbo", (uow) => uow.equipo.listar());
  const estado = Object.fromEntries(equipo.map((u) => [u.email, `${u.role}/${u.status}`]));
  assert.deepEqual(estado, { "piloto@rumbo.example": "owner/active", "otro@rumbo.example": "member/invited" });
});

test("suspender deshabilita a todos en Cognito y reactivar los devuelve", async () => {
  const d = new DirectorioEnMemoria();
  await d.invitar({ email: "piloto@rumbo.example", name: null, tenantId: "tenant-rumbo", role: "owner" });
  await d.invitar({ email: "otro@rumbo.example", name: null, tenantId: "tenant-rumbo", role: "member" });
  const s = await base.admin.enTenant("tenant-rumbo", (uow) => cambiarSuspension(uow, d, true));
  assert.equal(s.afectados, 2);
  assert.ok([...d.usuarios.values()].every((u) => !u.habilitado));
  assert.equal((await base.admin.enTenant("tenant-rumbo", (uow) => uow.equipo.tenant()))?.status, "suspended");
  await base.admin.enTenant("tenant-rumbo", (uow) => cambiarSuspension(uow, d, false));
  assert.ok([...d.usuarios.values()].every((u) => u.habilitado));
});
