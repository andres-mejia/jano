import { z } from "zod";
import { BuyingSignalSchema } from "./campaign";

/**
 * Cuenta (empresa) y contacto.
 *
 * El fit lo puntúa el Account Finder y siempre va con la evidencia que leyó:
 * un número sin fuente no se muestra. El contacto guarda el origen de cada
 * dato y el estado de su base legal (AGENTS.md §3).
 */

export const DataSourceSchema = z.enum(["registro", "web", "prensa", "linkedin", "proveedor"]);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const EvidenceSchema = z.object({
  source: DataSourceSchema,
  summary: z.string().min(1),
  url: z.string().url().nullable(),
  observedAt: z.string().datetime(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FitLevelSchema = z.enum(["alto", "medio", "bajo"]);
export type FitLevel = z.infer<typeof FitLevelSchema>;

export function fitLevelFromScore(score: number): FitLevel {
  if (score >= 75) return "alto";
  if (score >= 50) return "medio";
  return "bajo";
}

export const TriggerSchema = z.object({
  signal: BuyingSignalSchema,
  summary: z.string().min(1),
  evidence: EvidenceSchema,
});
export type Trigger = z.infer<typeof TriggerSchema>;

export const AccountStatusSchema = z.enum([
  "found",
  "approved",
  "discarded",
  "enriching",
  "contacted",
]);
export type AccountStatus = z.infer<typeof AccountStatusSchema>;

export const AccountSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  name: z.string().min(1),
  domain: z.string().min(1),
  city: z.string().nullable(),
  cnae: z.string().nullable(),
  revenueEur: z.number().int().nonnegative().nullable(),
  employees: z.number().int().nonnegative().nullable(),
  fitScore: z.number().int().min(0).max(100),
  fitReasoning: z.string(),
  fitEvidence: z.array(EvidenceSchema),
  trigger: TriggerSchema.nullable(),
  status: AccountStatusSchema,
  createdAt: z.string().datetime(),
});
export type Account = z.infer<typeof AccountSchema>;

export const LegalBasisStatusSchema = z.enum(["pending", "validated", "rejected"]);
export type LegalBasisStatus = z.infer<typeof LegalBasisStatusSchema>;

export const ContactSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  name: z.string().min(1),
  role: z.string().min(1),
  email: z.string().email(),
  emailSource: DataSourceSchema,
  emailVerified: z.boolean(),
  verificationConfidence: z.number().int().min(0).max(100).nullable(),
  verificationProvider: z.string().nullable(),
  companyWhatsapp: z.string().nullable(),
  legalBasis: LegalBasisStatusSchema,
  createdAt: z.string().datetime(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const AccountSelectionSchema = z.object({
  accountIds: z.array(z.string().uuid()).min(1).max(500),
});
export type AccountSelection = z.infer<typeof AccountSelectionSchema>;
