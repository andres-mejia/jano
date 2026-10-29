import type { TenantRole, TenantStatus, TenantUser, TenantUserStatus } from "@jano/domain";

/**
 * Persistencia. Toda operación de negocio ocurre dentro de `enTenant`: una
 * transacción con `app.tenant_id` fijado, de modo que la base de datos (RLS) solo
 * deja ver y escribir filas de ese tenant aunque una consulta olvide filtrar.
 */
export interface Db {
  enTenant<T>(tenantId: string, fn: (uow: UnidadDeTrabajo) => Promise<T>): Promise<T>;
}

export interface UnidadDeTrabajo {
  readonly equipo: RepositorioEquipo;
}

export interface TenantGuardado {
  readonly id: string;
  readonly name: string;
  readonly plan: string;
  readonly status: TenantStatus;
}

export type Accion =
  | "tenant_created"
  | "user_invited"
  | "user_disabled"
  | "user_enabled"
  | "invitation_resent"
  | "tenant_suspended"
  | "tenant_reactivated"
  | "user_imported";

export interface NuevoUsuario {
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: TenantRole;
  readonly status: TenantUserStatus;
  readonly invitedBy: string | null;
}

export interface RepositorioEquipo {
  tenant(): Promise<TenantGuardado | null>;
  crearTenant(t: { id: string; name: string; plan?: string }): Promise<void>;
  cambiarEstadoTenant(status: TenantStatus): Promise<void>;
  usuario(userId: string): Promise<TenantUser | null>;
  listar(): Promise<TenantUser[]>;
  /** Lanza `EmailOcupado` si el email o el usuario ya existen en cualquier tenant. */
  insertar(u: NuevoUsuario): Promise<TenantUser>;
  cambiarEstado(userId: string, status: TenantUserStatus): Promise<TenantUser>;
  registrar(actor: string, action: Accion, target?: string | null): Promise<void>;
}

export class EmailOcupado extends Error {
  constructor() {
    super("email ocupado");
    this.name = "EmailOcupado";
  }
}
