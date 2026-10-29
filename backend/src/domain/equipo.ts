import type { TenantUser } from "@jano/domain";

import { conflicto, prohibido } from "./errores";

/**
 * Reglas del equipo de un tenant (spec 007, data-model.md). Puras: no saben de
 * base de datos ni de Cognito.
 */

/** Quién hace la petición, ya comprobado contra la base de datos. */
export interface Actor {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: TenantUser["role"];
}

export function exigirOwner(actor: Actor): void {
  if (actor.role !== "owner") throw prohibido("Solo el responsable de la cuenta puede gestionar el equipo.");
}

/**
 * Desde la app no se desactiva a uno mismo ni a otro owner. Así siempre queda al
 * menos un owner activo: los cambios de owner son una operación del equipo de Jano.
 */
export function comprobarDesactivable(actor: Actor, objetivo: TenantUser): void {
  if (objetivo.userId === actor.userId) throw conflicto("No puedes desactivar tu propia cuenta.");
  if (objetivo.role === "owner") throw conflicto("No se puede desactivar a un responsable de la cuenta desde la app.");
}

export function comprobarReenviable(objetivo: TenantUser): void {
  if (objetivo.status !== "invited") throw conflicto("Esta persona ya ha entrado; no hace falta reenviar la invitación.");
}

/** Los owners primero y luego por email. */
export function ordenarEquipo(usuarios: readonly TenantUser[]): TenantUser[] {
  return [...usuarios].sort((a, b) =>
    a.role === b.role ? a.email.localeCompare(b.email) : a.role === "owner" ? -1 : 1,
  );
}
