import { z } from "zod";

/**
 * Tenant y equipo (spec 007).
 *
 * Jano es B2B: un tenant es una empresa cliente con varios usuarios. El tenant
 * viaja en el JWT (`custom:tenant_id`) y nunca en el cuerpo de una petición.
 */

export const TenantIdSchema = z.string().regex(/^tenant-[a-z0-9-]{2,48}$/);
export type TenantId = z.infer<typeof TenantIdSchema>;

export const TenantRoleSchema = z.enum(["owner", "member"]);
export type TenantRole = z.infer<typeof TenantRoleSchema>;

export const TenantStatusSchema = z.enum(["active", "suspended"]);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

/** `invited` hasta la primera petición autenticada; `disabled` corta el acceso. */
export const TenantUserStatusSchema = z.enum(["invited", "active", "disabled"]);
export type TenantUserStatus = z.infer<typeof TenantUserStatusSchema>;

export const CurrentTenantSchema = z.object({
  id: TenantIdSchema,
  name: z.string().min(1).max(120),
  plan: z.string().min(1),
  status: TenantStatusSchema,
  role: TenantRoleSchema,
});
export type CurrentTenant = z.infer<typeof CurrentTenantSchema>;

export const TenantUserSchema = z.object({
  userId: z.string().min(1).max(64),
  email: z.string().email().max(254),
  name: z.string().min(1).max(120).nullable(),
  role: TenantRoleSchema,
  status: TenantUserStatusSchema,
  invitedBy: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type TenantUser = z.infer<typeof TenantUserSchema>;

export const InviteTenantUserSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((e) => e.toLowerCase()),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type InviteTenantUser = z.infer<typeof InviteTenantUserSchema>;
