import type { TenantRole, TenantStatus, TenantUser, TenantUserStatus } from "@jano/domain";

import type {
  Proyecciones,
  RegistroDeEventos,
  RepositorioBandeja,
  RepositorioCampanas,
  RepositorioCuentas,
  RepositorioCumplimiento,
  RepositorioProspects,
} from "./repositorios";

/**
 * Persistencia. Toda operación de negocio ocurre dentro de `enTenant`: una
 * transacción con `app.tenant_id` fijado, de modo que la base de datos (RLS) solo
 * deja ver y escribir filas de ese tenant aunque una consulta olvide filtrar.
 */
export interface Db {
  enTenant<T>(tenantId: string, fn: (uow: UnidadDeTrabajo) => Promise<T>): Promise<T>;
  /**
   * Motor (ADR-003): qué tenants tienen pasos vencidos y cuándo vence el próximo,
   * con el rol jano_motor, que solo ve tenant, estado y fecha de los pasos.
   */
  agendaDelMotor(ahora: Date): Promise<{ vencidos: string[]; proximo: Date | null }>;
  /** Token opaco de un correo (baja, respuestas): a qué tenant y prospect pertenece. */
  resolverToken(token: string): Promise<{ tenantId: string; prospectId: string } | null>;
}

export interface UnidadDeTrabajo {
  readonly equipo: RepositorioEquipo;
  readonly campanas: RepositorioCampanas;
  readonly cuentas: RepositorioCuentas;
  readonly prospects: RepositorioProspects;
  readonly eventos: RegistroDeEventos;
  readonly bandeja: RepositorioBandeja;
  readonly cumplimiento: RepositorioCumplimiento;
  readonly vistas: Proyecciones;
  /**
   * Efecto fuera de la base de datos que solo debe ocurrir si la transacción se
   * confirma (adelantar el despertador del motor). Se ejecuta tras el commit.
   */
  alConfirmar(fn: () => Promise<void>): void;
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
