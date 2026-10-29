import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type AttributeType,
  type UserType,
} from "@aws-sdk/client-cognito-identity-provider";
import { TenantRoleSchema } from "@jano/domain";

import { EmailOcupado } from "../ports/db";
import type { Directorio, UsuarioDeDirectorio } from "../ports/directorio";

const atributo = (attrs: AttributeType[] | undefined, nombre: string): string | null =>
  attrs?.find((a) => a.Name === nombre)?.Value ?? null;

/**
 * Cognito como directorio. El usuario se crea con el email como nombre de usuario
 * (el pool usa `username_attributes = ["email"]`); Cognito envía la invitación con
 * contraseña temporal, y si la persona usa Google con ese email, el trigger
 * PreSignUp la enlaza (spec 006).
 */
export class CognitoDirectorio implements Directorio {
  constructor(
    private readonly userPoolId: string,
    private readonly cliente = new CognitoIdentityProviderClient({}),
  ) {}

  async invitar(u: { email: string; name: string | null; tenantId: string; role: "owner" | "member" }) {
    const attrs: AttributeType[] = [
      { Name: "email", Value: u.email },
      { Name: "email_verified", Value: "true" },
      { Name: "custom:tenant_id", Value: u.tenantId },
      { Name: "custom:role", Value: u.role },
    ];
    if (u.name) attrs.push({ Name: "name", Value: u.name });
    try {
      const out = await this.cliente.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: u.email,
          UserAttributes: attrs,
          DesiredDeliveryMediums: ["EMAIL"],
        }),
      );
      const sub = atributo(out.User?.Attributes, "sub");
      if (!sub) throw new Error("Cognito no devolvió el sub del usuario creado");
      return sub;
    } catch (e) {
      if ((e as { name?: string }).name === "UsernameExistsException") throw new EmailOcupado();
      throw e;
    }
  }

  async borrar(email: string) {
    await this.cliente.send(new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: email }));
  }

  async reenviar(email: string) {
    await this.cliente.send(
      new AdminCreateUserCommand({
        UserPoolId: this.userPoolId,
        Username: email,
        MessageAction: "RESEND",
        DesiredDeliveryMediums: ["EMAIL"],
      }),
    );
  }

  async deshabilitar(email: string) {
    await this.cliente.send(new AdminDisableUserCommand({ UserPoolId: this.userPoolId, Username: email }));
    await this.cliente.send(new AdminUserGlobalSignOutCommand({ UserPoolId: this.userPoolId, Username: email }));
  }

  async habilitar(email: string) {
    await this.cliente.send(new AdminEnableUserCommand({ UserPoolId: this.userPoolId, Username: email }));
    const u = await this.cliente.send(new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: email }));
    return { confirmado: u.UserStatus !== "FORCE_CHANGE_PASSWORD" };
  }

  async listarPorTenant(tenantId: string): Promise<UsuarioDeDirectorio[]> {
    // ListUsers no filtra por atributos propios: se recorre el pool y se filtra aquí.
    const todos: UserType[] = [];
    let token: string | undefined;
    do {
      const out = await this.cliente.send(
        new ListUsersCommand({ UserPoolId: this.userPoolId, ...(token ? { PaginationToken: token } : {}) }),
      );
      todos.push(...(out.Users ?? []));
      token = out.PaginationToken;
    } while (token);

    return todos
      .filter((u) => atributo(u.Attributes, "custom:tenant_id") === tenantId)
      .map((u) => ({
        userId: atributo(u.Attributes, "sub") ?? "",
        email: (atributo(u.Attributes, "email") ?? "").toLowerCase(),
        name: atributo(u.Attributes, "name"),
        role: TenantRoleSchema.parse(atributo(u.Attributes, "custom:role")),
        confirmado: u.UserStatus !== "FORCE_CHANGE_PASSWORD",
        habilitado: u.Enabled !== false,
      }));
  }
}
