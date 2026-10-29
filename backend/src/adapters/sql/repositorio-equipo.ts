import type { TenantStatus, TenantUser, TenantUserStatus } from "@jano/domain";

import { type Accion, EmailOcupado, type NuevoUsuario, type RepositorioEquipo, type TenantGuardado } from "../../ports/db";
import { esViolacionDeUnicidad, type Tx } from "./tx";

/**
 * Dos barreras (FR-008): cada consulta filtra por el tenant de la transacción y,
 * además, RLS solo deja ver las filas de `app.tenant_id`. La batería de aislamiento
 * prueba la segunda sola, con consultas sin filtro.
 */

const COLUMNAS_USUARIO = `user_id, email, name, role, status, invited_by,
  (extract(epoch from created_at) * 1000)::bigint as created_ms`;

interface FilaUsuario {
  user_id: string;
  email: string;
  name: string | null;
  role: TenantUser["role"];
  status: TenantUserStatus;
  invited_by: string | null;
  created_ms: string | number;
}

const aUsuario = (f: FilaUsuario): TenantUser => ({
  userId: f.user_id,
  email: f.email,
  name: f.name,
  role: f.role,
  status: f.status,
  invitedBy: f.invited_by,
  createdAt: new Date(Number(f.created_ms)).toISOString(),
});

export function repositorioEquipo(tx: Tx, tenantId: string): RepositorioEquipo {
  const primero = <T>(filas: T[]): T | null => filas[0] ?? null;

  return {
    async tenant() {
      return primero(await tx.query<TenantGuardado>("select id, name, plan, status from tenants where id = :t", { t: tenantId }));
    },

    async crearTenant(t) {
      if (t.id !== tenantId) throw new Error("el tenant no coincide con el de la transacción");
      await tx.query("insert into tenants (id, name, plan) values (:id, :name, :plan)", {
        id: t.id,
        name: t.name,
        plan: t.plan ?? "piloto",
      });
    },

    async cambiarEstadoTenant(status: TenantStatus) {
      await tx.query("update tenants set status = :status where id = :t", { status, t: tenantId });
    },

    async usuario(userId) {
      const f = primero(
        await tx.query<FilaUsuario>(`select ${COLUMNAS_USUARIO} from tenant_users where tenant_id = :t and user_id = :user_id`, {
          t: tenantId,
          user_id: userId,
        }),
      );
      return f && aUsuario(f);
    },

    async listar() {
      return (await tx.query<FilaUsuario>(`select ${COLUMNAS_USUARIO} from tenant_users where tenant_id = :t`, { t: tenantId })).map(aUsuario);
    },

    async insertar(u: NuevoUsuario) {
      try {
        const [f] = await tx.query<FilaUsuario>(
          `insert into tenant_users (tenant_id, user_id, email, name, role, status, invited_by)
           values (:tenant_id, :user_id, :email, :name, :role, :status, :invited_by)
           returning ${COLUMNAS_USUARIO}`,
          {
            tenant_id: tenantId,
            user_id: u.userId,
            email: u.email.toLowerCase(),
            name: u.name,
            role: u.role,
            status: u.status,
            invited_by: u.invitedBy,
          },
        );
        if (!f) throw new Error("insert sin returning");
        return aUsuario(f);
      } catch (e) {
        if (esViolacionDeUnicidad(e)) throw new EmailOcupado();
        throw e;
      }
    },

    async cambiarEstado(userId, status) {
      const [f] = await tx.query<FilaUsuario>(
        `update tenant_users set status = :status, updated_at = now()
         where tenant_id = :t and user_id = :user_id returning ${COLUMNAS_USUARIO}`,
        { status, t: tenantId, user_id: userId },
      );
      if (!f) throw new Error(`usuario ${userId} no encontrado`);
      return aUsuario(f);
    },

    async registrar(actor: string, action: Accion, target: string | null = null) {
      await tx.query("insert into user_activity (tenant_id, actor, action, target) values (:tenant_id, :actor, :action, :target)", {
        tenant_id: tenantId,
        actor,
        action,
        target,
      });
    },
  };
}
