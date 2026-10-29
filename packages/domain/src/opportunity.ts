import { z } from "zod";

/**
 * Oportunidad: una reunión agendada con un prospect (spec 008, US5). La crea el
 * motor al aprobar un borrador con huecos; se exporta a Excel como CSV.
 */

export const OpportunityStatusSchema = z.enum(["open", "won", "lost"]);
export type OpportunityStatus = z.infer<typeof OpportunityStatusSchema>;

export const OpportunitySchema = z.object({
  id: z.string().uuid(),
  prospectId: z.string().uuid(),
  campaignId: z.string().uuid(),
  campaignName: z.string().min(1),
  accountName: z.string().min(1),
  domain: z.string().min(1),
  contactName: z.string().nullable(),
  contactRole: z.string().nullable(),
  contactEmail: z.string().email().nullable(),
  meetingStart: z.string().datetime().nullable(),
  meetingEnd: z.string().datetime().nullable(),
  status: OpportunityStatusSchema,
  createdAt: z.string().datetime(),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;
