import { z } from "zod";

/**
 * Campaña e ICP.
 *
 * El ICP lo escribe el cliente en una frase; el Orquestador lo convierte en
 * esta estructura y la persona la corrige. Lo que se guarda es la estructura,
 * no la frase: es lo que leen el Account Finder y las reglas de fit.
 */

export const BuyingSignalSchema = z.enum([
  "vacante_comercial",
  "nueva_oficina",
  "web_renovada",
  "cambio_administrador",
  "ronda_financiacion",
  "nuevo_producto",
]);
export type BuyingSignal = z.infer<typeof BuyingSignalSchema>;

export const IcpSchema = z.object({
  sector: z.string().min(1),
  cnae: z.array(z.string().regex(/^\d{4}$/)).default([]),
  country: z.literal("ES"),
  regions: z.array(z.string()).default([]),
  revenueMinEur: z.number().int().nonnegative().nullable(),
  revenueMaxEur: z.number().int().positive().nullable(),
  employeesMin: z.number().int().nonnegative().nullable(),
  signals: z.array(BuyingSignalSchema).default([]),
  exclusions: z.array(z.string()).default([]),
});
export type Icp = z.infer<typeof IcpSchema>;

export const CampaignStatusSchema = z.enum(["draft", "active", "paused", "finished"]);
export type CampaignStatus = z.infer<typeof CampaignStatusSchema>;

export const CampaignStatsSchema = z.object({
  accountsFound: z.number().int().nonnegative(),
  accountsHighFit: z.number().int().nonnegative(),
  contactsVerified: z.number().int().nonnegative(),
  contacted: z.number().int().nonnegative(),
  replied: z.number().int().nonnegative(),
  meetings: z.number().int().nonnegative(),
});
export type CampaignStats = z.infer<typeof CampaignStatsSchema>;

export const CampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  prompt: z.string().min(1),
  icp: IcpSchema,
  status: CampaignStatusSchema,
  meetingsGoal: z.number().int().positive(),
  stats: CampaignStatsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

export const CreateCampaignSchema = z.object({
  prompt: z.string().min(10).max(500),
  meetingsGoal: z.number().int().positive().max(200).default(12),
});
export type CreateCampaign = z.infer<typeof CreateCampaignSchema>;

/** Un turno del diálogo con el Orquestador para afinar el ICP. */
export const IcpTurnSchema = z.object({
  role: z.enum(["user", "jano"]),
  text: z.string(),
  icp: IcpSchema.optional(),
  suggestions: z.array(z.string()).default([]),
  at: z.string().datetime(),
});
export type IcpTurn = z.infer<typeof IcpTurnSchema>;
