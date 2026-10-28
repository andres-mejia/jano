import { z } from "zod";
import { AgentSchema, ProspectStageSchema } from "./prospect";

/**
 * Vistas agregadas: centro de mando y mapa de flujo. Son proyecciones del
 * registro de eventos; no guardan nada propio.
 */

export const KpiSchema = z.object({
  value: z.number().int().nonnegative(),
  note: z.string(),
  trend: z.array(z.number().nonnegative()),
});
export type Kpi = z.infer<typeof KpiSchema>;

export const FunnelStageSchema = z.object({
  key: z.enum(["found", "high_fit", "contacted", "replied", "meetings"]),
  label: z.string(),
  value: z.number().int().nonnegative(),
});
export type FunnelStage = z.infer<typeof FunnelStageSchema>;

export const AgentActivitySchema = z.object({
  agent: AgentSchema,
  status: z.enum(["working", "deciding", "waiting_human", "idle"]),
  summary: z.string(),
  at: z.string().datetime(),
});
export type AgentActivity = z.infer<typeof AgentActivitySchema>;

export const PendingDecisionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["inbox_draft", "accounts_approval", "whatsapp_approval"]),
  title: z.string(),
  subtitle: z.string(),
  href: z.string(),
});
export type PendingDecision = z.infer<typeof PendingDecisionSchema>;

export const UpcomingMeetingSchema = z.object({
  id: z.string().uuid(),
  accountName: z.string(),
  contactName: z.string(),
  start: z.string().datetime(),
  status: z.enum(["confirmed", "proposed", "draft"]),
});
export type UpcomingMeeting = z.infer<typeof UpcomingMeetingSchema>;

export const JanoInsightSchema = z.object({
  text: z.string(),
  action: z.string().nullable(),
});
export type JanoInsight = z.infer<typeof JanoInsightSchema>;

export const DashboardSummarySchema = z.object({
  campaignId: z.string().uuid().nullable(),
  campaignName: z.string().nullable(),
  kpis: z.object({
    accountsFound: KpiSchema,
    contactsVerified: KpiSchema,
    openConversations: KpiSchema,
    meetingsBooked: KpiSchema,
  }),
  meetingsGoal: z.number().int().positive(),
  funnel: z.array(FunnelStageSchema),
  agents: z.array(AgentActivitySchema),
  guardrailNotice: z.string().nullable(),
  insight: JanoInsightSchema.nullable(),
  pending: z.array(PendingDecisionSchema),
  meetingsByWeek: z.array(z.object({ week: z.string(), count: z.number().int().nonnegative() })),
  upcomingMeetings: z.array(UpcomingMeetingSchema),
});
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;

export const FlowNodeSchema = z.object({
  stage: ProspectStageSchema.or(z.literal("icp")),
  label: z.string(),
  value: z.number().int().nonnegative(),
  note: z.string(),
  active: z.boolean(),
});
export type FlowNode = z.infer<typeof FlowNodeSchema>;

export const FlowExitSchema = z.object({
  afterStage: ProspectStageSchema,
  label: z.string(),
  value: z.number().int().nonnegative(),
  note: z.string(),
});
export type FlowExit = z.infer<typeof FlowExitSchema>;

export const FlowMapSchema = z.object({
  campaignId: z.string().uuid(),
  campaignName: z.string(),
  nodes: z.array(FlowNodeSchema),
  exits: z.array(FlowExitSchema),
  bottleneck: z.object({ stage: ProspectStageSchema, text: z.string(), option: z.string(), effect: z.string() }).nullable(),
});
export type FlowMap = z.infer<typeof FlowMapSchema>;
