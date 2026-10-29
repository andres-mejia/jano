import { TenantIdSchema } from "@jano/domain";
import { z } from "zod";

import { conflicto, invalido } from "../domain/errores";
import { EmailOcupado, type UnidadDeTrabajo } from "../ports/db";
import type { Directorio } from "../ports/directorio";

/**
 * Operaciones del equipo de Jano (FR-003): no hay registro abierto, así que dar de
 * alta, importar y suspender empresas son comandos de `scripts/`, no rutas de la API.
 * El actor queda registrado como `ops`.
 */

const AltaSchema = z.object({
  tenantId: TenantIdSchema,
  nombre: z.string().trim().min(1).max(120),
  owner: z.string().trim().email().max(254).transform((e) => e.toLowerCase()),
  nombreOwner: z.string().trim().min(1).max(120).nullable(),
});

export async function altaTenant(
  uow: UnidadDeTrabajo,
  directorio: Directorio,
  entrada: z.input<typeof AltaSchema>,
): Promise<{ ownerId: string }> {
  const datos = AltaSchema.safeParse(entrada);
  if (!datos.success) throw invalido(`datos de alta no válidos: ${datos.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  const { tenantId, nombre, owner, nombreOwner } = datos.data;

  if (await uow.equipo.tenant()) throw conflicto(`el tenant ${tenantId} ya existe`);
  await uow.equipo.crearTenant({ id: tenantId, name: nombre });
  await uow.equipo.registrar("ops", "tenant_created", tenantId);

  let ownerId: string;
  try {
    ownerId = await directorio.invitar({ email: owner, name: nombreOwner, tenantId, role: "owner" });
  } catch (e) {
    if (e instanceof EmailOcupado) throw conflicto(`${owner} ya es usuario de Jano: no se crea nada`);
    throw e;
  }
  try {
    await uow.equipo.insertar({ userId: ownerId, email: owner, name: nombreOwner, role: "owner", status: "invited", invitedBy: "ops" });
    await uow.equipo.registrar("ops", "user_invited", ownerId);
  } catch (e) {
    await directorio.borrar(owner);
    if (e instanceof EmailOcupado) throw conflicto(`${owner} ya es usuario de Jano: no se crea nada`);
    throw e;
  }
  return { ownerId };
}

/** Lleva a la base de datos un tenant que hasta ahora solo existía como atributo en Cognito. Idempotente. */
export async function importarTenant(
  uow: UnidadDeTrabajo,
  directorio: Directorio,
  entrada: { tenantId: string; nombre: string },
): Promise<{ importados: string[] }> {
  const tenantId = TenantIdSchema.parse(entrada.tenantId);
  if (!(await uow.equipo.tenant())) {
    await uow.equipo.crearTenant({ id: tenantId, name: entrada.nombre });
    await uow.equipo.registrar("ops", "tenant_created", tenantId);
  }
  const yaEstan = new Set((await uow.equipo.listar()).map((u) => u.userId));
  const importados: string[] = [];
  for (const u of await directorio.listarPorTenant(tenantId)) {
    if (yaEstan.has(u.userId)) continue;
    await uow.equipo.insertar({
      userId: u.userId,
      email: u.email,
      name: u.name,
      role: u.role,
      status: !u.habilitado ? "disabled" : u.confirmado ? "active" : "invited",
      invitedBy: "ops",
    });
    await uow.equipo.registrar("ops", "user_imported", u.userId);
    importados.push(u.email);
  }
  return { importados };
}

/**
 * Suspender corta el acceso de todo el tenant en Cognito (no entra) y en la API
 * (no opera); reactivar devuelve el acceso a quien no estaba desactivado a título
 * individual.
 */
export async function cambiarSuspension(
  uow: UnidadDeTrabajo,
  directorio: Directorio,
  suspender: boolean,
): Promise<{ afectados: number }> {
  const t = await uow.equipo.tenant();
  if (!t) throw invalido("el tenant no existe");
  await uow.equipo.cambiarEstadoTenant(suspender ? "suspended" : "active");
  const usuarios = (await uow.equipo.listar()).filter((u) => u.status !== "disabled");
  for (const u of usuarios) {
    if (suspender) await directorio.deshabilitar(u.email);
    else await directorio.habilitar(u.email);
  }
  await uow.equipo.registrar("ops", suspender ? "tenant_suspended" : "tenant_reactivated", t.id);
  return { afectados: usuarios.length };
}
