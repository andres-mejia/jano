import type { Actor } from "../domain/equipo";
import { prohibido } from "../domain/errores";
import type { UnidadDeTrabajo } from "../ports/db";

/** Lo que dice el JWT ya validado por API Gateway. */
export interface Sesion {
  readonly userId: string;
  readonly tenantId: string;
}

/**
 * Antes de cualquier caso de uso: el tenant y el usuario existen y están activos
 * (FR-006). El token de un usuario desactivado sigue siendo válido hasta que
 * caduca, así que esta comprobación es la que corta su acceso en la siguiente
 * petición. El rol sale de la base de datos, no del token.
 */
export async function cargarActor(uow: UnidadDeTrabajo, sesion: Sesion): Promise<Actor> {
  const tenant = await uow.equipo.tenant();
  if (!tenant || tenant.status !== "active") throw prohibido("Tu empresa no tiene acceso a Jano ahora mismo.");

  const usuario = await uow.equipo.usuario(sesion.userId);
  if (!usuario || usuario.status === "disabled") throw prohibido("Tu acceso a Jano está desactivado.");
  if (usuario.status === "invited") await uow.equipo.cambiarEstado(usuario.userId, "active");

  return { userId: usuario.userId, tenantId: tenant.id, role: usuario.role };
}
