import { z } from "zod";

/**
 * Prospect, secuencia y registro de eventos.
 *
 * Un prospect es una cuenta con contacto dentro de una campaña. Su estado es
 * una máquina de estados explícita (`ProspectStage`); las transiciones las
 * propone la IA y las ejecuta el motor, que escribe un `ProspectEvent` por
 * cada decisión, envío, bloqueo o respuesta. El registro es append-only y es
 * la única fuente del mapa de flujo y de la auditoría (ADR-002).
 */

export const ProspectStageSchema = z.enum([
  "found",
  "enriched",
  "unverified",
  "in_sequence",
  "waiting",
  "replied",
  "meeting",
  "not_now",
  "opted_out",
  "discarded",
]);
export type ProspectStage = z.infer<typeof ProspectStageSchema>;

/** Transiciones permitidas. Lo que no está aquí, el motor lo rechaza. */
export const PROSPECT_TRANSITIONS: Readonly<Record<ProspectStage, readonly ProspectStage[]>> = {
  found: ["enriched", "unverified", "discarded"],
  enriched: ["in_sequence", "discarded"],
  unverified: ["enriched", "discarded"],
  in_sequence: ["waiting", "replied", "opted_out", "discarded"],
  waiting: ["in_sequence", "replied", "opted_out", "discarded"],
  replied: ["meeting", "not_now", "opted_out", "in_sequence"],
  meeting: [],
  not_now: ["in_sequence", "discarded"],
  opted_out: [],
  discarded: [],
};

export function canTransition(from: ProspectStage, to: ProspectStage): boolean {
  return PROSPECT_TRANSITIONS[from].includes(to);
}

export const ChannelSchema = z.enum(["email", "whatsapp"]);
export type Channel = z.infer<typeof ChannelSchema>;

export const SequenceKindSchema = z.enum(["consultiva", "trigger"]);
export type SequenceKind = z.infer<typeof SequenceKindSchema>;

export const StepStatusSchema = z.enum([
  "planned",
  "awaiting_approval",
  "sent",
  "skipped",
  "cancelled",
  "blocked",
]);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const SequenceStepSchema = z.object({
  id: z.string().uuid(),
  day: z.number().int().nonnegative(),
  channel: ChannelSchema,
  title: z.string().min(1),
  intent: z.string(),
  status: StepStatusSchema,
  scheduledFor: z.string().datetime().nullable(),
});
export type SequenceStep = z.infer<typeof SequenceStepSchema>;

export const SequenceSchema = z.object({
  id: z.string().uuid(),
  kind: SequenceKindSchema,
  steps: z.array(SequenceStepSchema),
  switchedFrom: SequenceKindSchema.nullable(),
  switchedAt: z.string().datetime().nullable(),
});
export type Sequence = z.infer<typeof SequenceSchema>;

export const AgentSchema = z.enum([
  "orchestrator",
  "account_finder",
  "contact_finder",
  "outreach",
  "response",
  "guardrail",
  "human",
]);
export type Agent = z.infer<typeof AgentSchema>;

export const EventTypeSchema = z.enum([
  "decision",
  "sent",
  "blocked",
  "deferred",
  "stopped",
  "replied",
  "approved",
  "rejected",
  "opt_out",
  "meeting_booked",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const RuleCheckSchema = z.object({
  rule: z.string().min(1),
  passed: z.boolean(),
  detail: z.string().nullable(),
});
export type RuleCheck = z.infer<typeof RuleCheckSchema>;

export const ProspectEventSchema = z.object({
  id: z.string().uuid(),
  prospectId: z.string().uuid(),
  at: z.string().datetime(),
  agent: AgentSchema,
  type: EventTypeSchema,
  summary: z.string().min(1),
  reasoning: z.string().nullable(),
  evidence: z.array(z.string()),
  rulesChecked: z.array(RuleCheckSchema),
  message: z
    .object({
      channel: ChannelSchema,
      subject: z.string().nullable(),
      body: z.string(),
    })
    .nullable(),
  stepId: z.string().uuid().nullable(),
});
export type ProspectEvent = z.infer<typeof ProspectEventSchema>;

export const ProspectSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  accountId: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  stage: ProspectStageSchema,
  sequence: SequenceSchema.nullable(),
  nextActionAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});
export type Prospect = z.infer<typeof ProspectSchema>;
