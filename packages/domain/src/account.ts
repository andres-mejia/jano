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

/**
 * Candidatas de una campaña (spec 008, FR-013b): la región del ICP para buscar
 * en OpenStreetMap, o dominios que pega la persona. Un dominio se normaliza a
 * su host sin `www.`, protocolo ni ruta.
 */
export const CompanyDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((d) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "")
  .pipe(z.string().regex(/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "dominio no válido"));

export const CandidateRequestSchema = z.union([
  z.object({ region: z.string().trim().min(2).max(80) }).strict(),
  z.object({ domains: z.array(CompanyDomainSchema).min(1).max(25) }).strict(),
]);
export type CandidateRequest = z.infer<typeof CandidateRequestSchema>;

/** Resultado de buscar candidatas: las nuevas (puntuadas o descartadas con su motivo) y las que ya estaban. */
export const CandidateResultSchema = z.object({
  added: z.number().int().nonnegative(),
  discarded: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  accounts: z.array(AccountSchema),
});
export type CandidateResult = z.infer<typeof CandidateResultSchema>;
