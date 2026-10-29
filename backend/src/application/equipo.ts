import type { InviteTenantUser, TenantUser } from "@jano/domain";

import { type Actor, comprobarDesactivable, comprobarReenviable, exigirOwner, ordenarEquipo } from "../domain/equipo";
import { conflicto, noEncontrado } from "../domain/errores";
import { EmailOcupado, type UnidadDeTrabajo } from "../ports/db";
import type { Directorio } from "../ports/directorio";

const EMAIL_OCUPADO = "Esa persona ya tiene cuenta en Jano. Si debería estar en tu equipo, escríbenos.";

export async function listarEquipo(uow: UnidadDeTrabajo, actor: Actor): Promise<TenantUser[]> {
  exigirOwner(actor);
  return ordenarEquipo(await uow.equipo.listar());
}

/** Cognito primero (envía el correo); si la base de datos falla, se deshace en Cognito. */
export async function invitar(
  uow: UnidadDeTrabajo,
  directorio: Directorio,
  actor: Actor,
  datos: InviteTenantUser,
): Promise<TenantUser> {
  exigirOwner(actor);
  const name = datos.name ?? null;

  let userId: string;
  try {
    userId = await directorio.invitar({ email: datos.email, name, tenantId: actor.tenantId, role: "member" });
  } catch (e) {
    if (e instanceof EmailOcupado) throw conflicto(EMAIL_OCUPADO);
    throw e;
  }

  try {
    const usuario = await uow.equipo.insertar({
      userId,
      email: datos.email,
      name,
      role: "member",
      status: "invited",
      invitedBy: actor.userId,
    });
    await uow.equipo.registrar(actor.userId, "user_invited", userId);
    return usuario;
  } catch (e) {
    await directorio.borrar(datos.email);
    if (e instanceof EmailOcupado) throw conflicto(EMAIL_OCUPADO);
    throw e;
  }
}

async function objetivo(uow: UnidadDeTrabajo, userId: string): Promise<TenantUser> {
  const u = await uow.equipo.usuario(userId);
  if (!u) throw noEncontrado();
  return u;
}

export async function desactivar(
  uow: UnidadDeTrabajo,
  directorio: Directorio,
  actor: Actor,
  userId: string,
): Promise<TenantUser> {
  exigirOwner(actor);
  const u = await objetivo(uow, userId);
  comprobarDesactivable(actor, u);
  if (u.status === "disabled") return u;
  await directorio.deshabilitar(u.email);
  const hecho = await uow.equipo.cambiarEstado(u.userId, "disabled");
  await uow.equipo.registrar(actor.userId, "user_disabled", u.userId);
  return hecho;
}

export async function reactivar(
  uow: UnidadDeTrabajo,
  directorio: Directorio,
  actor: Actor,
  userId: string,
): Promise<TenantUser> {
  exigirOwner(actor);
  const u = await objetivo(uow, userId);
  if (u.status !== "disabled") return u;
  const { confirmado } = await directorio.habilitar(u.email);
  const hecho = await uow.equipo.cambiarEstado(u.userId, confirmado ? "active" : "invited");
  await uow.equipo.registrar(actor.userId, "user_enabled", u.userId);
  return hecho;
}

export async function reenviarInvitacion(
  uow: UnidadDeTrabajo,
  directorio: Directorio,
  actor: Actor,
  userId: string,
): Promise<TenantUser> {
  exigirOwner(actor);
  const u = await objetivo(uow, userId);
  comprobarReenviable(u);
  await directorio.reenviar(u.email);
  await uow.equipo.registrar(actor.userId, "invitation_resent", u.userId);
  return u;
}
