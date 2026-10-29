import type { CurrentTenant } from "@jano/domain";

import type { Actor } from "../domain/equipo";
import { noEncontrado } from "../domain/errores";
import type { UnidadDeTrabajo } from "../ports/db";

export async function tenantActual(uow: UnidadDeTrabajo, actor: Actor): Promise<CurrentTenant> {
  const t = await uow.equipo.tenant();
  if (!t) throw noEncontrado();
  return { id: t.id, name: t.name, plan: t.plan, status: t.status, role: actor.role };
}
