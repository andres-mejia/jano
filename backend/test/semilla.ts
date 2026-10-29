import type { TenantRole, TenantUserStatus } from "@jano/domain";

import type { PgDb } from "../src/adapters/pg-db";

/** Empresas y personas inventadas, con dominios `.example` (AGENTS.md §5). */
export const A = { id: "tenant-faro", name: "Faro Ingeniería", owner: "ana@faro.example" } as const;
export const B = { id: "tenant-brisa", name: "Brisa Logística", owner: "bruno@brisa.example" } as const;

export async function sembrarTenant(
  admin: PgDb,
  t: { id: string; name: string; owner: string },
  extra: { email: string; role: TenantRole; status: TenantUserStatus }[] = [],
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  await admin.enTenant(t.id, async ({ equipo }) => {
    await equipo.crearTenant({ id: t.id, name: t.name });
    for (const u of [{ email: t.owner, role: "owner" as const, status: "active" as const }, ...extra]) {
      const userId = `sub-${u.email}`;
      await equipo.insertar({ userId, email: u.email, name: null, role: u.role, status: u.status, invitedBy: "ops" });
      ids[u.email] = userId;
    }
  });
  return ids;
}
