import { z } from "zod";
import { AgentSchema, EventTypeSchema } from "./prospect";

/**
 * Cumplimiento: reglas fijas, salud del dominio y auditoría.
 *
 * Las reglas son del motor, no del modelo: el LLM no las ve como texto que
 * pueda reinterpretar. `autopilot` es la única que relaja algo y es opt-in.
 */

export const GuardrailsSchema = z.object({
  maxSendsPerMailboxPerDay: z.number().int().min(1).max(200),
  requireVerifiedEmail: z.boolean(),
  whatsappOnlyAfterReply: z.boolean(),
  stopSequenceOnReply: z.boolean(),
  autopilot: z.boolean(),
});
export type Guardrails = z.infer<typeof GuardrailsSchema>;

export const DEFAULT_GUARDRAILS: Guardrails = {
  maxSendsPerMailboxPerDay: 50,
  requireVerifiedEmail: true,
  whatsappOnlyAfterReply: true,
  stopSequenceOnReply: true,
  autopilot: false,
};

export const DomainHealthSchema = z.object({
  domain: z.string().min(1),
  spf: z.boolean(),
  dkim: z.boolean(),
  dmarc: z.boolean(),
  warmupDay: z.number().int().nonnegative(),
  warmupTotalDays: z.number().int().positive(),
  bounceRatePct: z.number().min(0).max(100),
  complaints: z.number().int().nonnegative(),
});
export type DomainHealth = z.infer<typeof DomainHealthSchema>;

export const ComplianceSummarySchema = z.object({
  sendsToday: z.number().int().nonnegative(),
  sendsLimit: z.number().int().positive(),
  contactsWithSource: z.number().int().nonnegative(),
  contactsTotal: z.number().int().nonnegative(),
  optOutsHandled: z.number().int().nonnegative(),
  optOutsTotal: z.number().int().nonnegative(),
  legalBasisValidatedPct: z.number().min(0).max(100),
  legalOpinionPending: z.boolean(),
  domains: z.array(DomainHealthSchema),
});
export type ComplianceSummary = z.infer<typeof ComplianceSummarySchema>;

export const AuditEntrySchema = z.object({
  id: z.string().uuid(),
  at: z.string().datetime(),
  agent: AgentSchema,
  type: EventTypeSchema,
  prospectId: z.string().uuid().nullable(),
  accountName: z.string().nullable(),
  summary: z.string().min(1),
  ruleApplied: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const ConnectionKindSchema = z.enum([
  "microsoft365",
  "company_data",
  "email_verification",
  "calendar",
  "crm",
  "llm",
]);
export type ConnectionKind = z.infer<typeof ConnectionKindSchema>;

export const ConnectionStatusSchema = z.enum(["connected", "error", "not_configured"]);
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const ConnectionSchema = z.object({
  kind: ConnectionKindSchema,
  name: z.string().min(1),
  detail: z.string(),
  status: ConnectionStatusSchema,
  lastCheckedAt: z.string().datetime().nullable(),
});
export type Connection = z.infer<typeof ConnectionSchema>;
