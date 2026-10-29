import { randomUUID } from "node:crypto";

import { EmailOcupado } from "../src/ports/db";
import type { Directorio, UsuarioDeDirectorio } from "../src/ports/directorio";

/** Directorio en memoria: sustituye a Cognito (infraestructura), no al dominio. */
export class DirectorioEnMemoria implements Directorio {
  readonly usuarios = new Map<string, UsuarioDeDirectorio & { tenantId: string }>();
  readonly reenvios: string[] = [];
  fallarAlInvitar: Error | null = null;

  async invitar(u: { email: string; name: string | null; tenantId: string; role: "owner" | "member" }) {
    if (this.fallarAlInvitar) throw this.fallarAlInvitar;
    if (this.usuarios.has(u.email)) throw new EmailOcupado();
    const userId = randomUUID();
    this.usuarios.set(u.email, { ...u, userId, confirmado: false, habilitado: true });
    return userId;
  }

  async borrar(email: string) {
    this.usuarios.delete(email);
  }

  async reenviar(email: string) {
    this.reenvios.push(email);
  }

  private cambiar(email: string, cambios: Partial<UsuarioDeDirectorio>) {
    const u = this.usuarios.get(email);
    if (!u) throw new Error(`no existe ${email}`);
    this.usuarios.set(email, { ...u, ...cambios });
    return u;
  }

  async deshabilitar(email: string) {
    this.cambiar(email, { habilitado: false });
  }

  async habilitar(email: string) {
    const u = this.cambiar(email, { habilitado: true });
    return { confirmado: u.confirmado };
  }

  async listarPorTenant(tenantId: string) {
    return [...this.usuarios.values()].filter((u) => u.tenantId === tenantId);
  }
}
