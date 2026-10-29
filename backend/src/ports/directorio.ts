import type { TenantRole } from "@jano/domain";

/** Identidad (Cognito): quién puede entrar. La pertenencia y el estado los guarda la base de datos. */
export interface Directorio {
  /** Crea el usuario y le envía la invitación. Lanza `EmailOcupado` si ya existe. Devuelve su `sub`. */
  invitar(u: { email: string; name: string | null; tenantId: string; role: TenantRole }): Promise<string>;
  /** Deshace un `invitar` cuando falla lo que viene después. */
  borrar(email: string): Promise<void>;
  reenviar(email: string): Promise<void>;
  /** Impide entrar y cierra las sesiones abiertas. */
  deshabilitar(email: string): Promise<void>;
  /** `confirmado`: ya había entrado alguna vez (para volver a `active` o a `invited`). */
  habilitar(email: string): Promise<{ confirmado: boolean }>;
  listarPorTenant(tenantId: string): Promise<UsuarioDeDirectorio[]>;
}

export interface UsuarioDeDirectorio {
  readonly userId: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: TenantRole;
  readonly confirmado: boolean;
  readonly habilitado: boolean;
}
