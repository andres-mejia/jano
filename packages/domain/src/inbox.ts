import { z } from "zod";
import { ChannelSchema } from "./prospect";

/**
 * Bandeja: respuestas clasificadas por el Response agent y el borrador que
 * deja listo. Nada sale sin `approved` salvo que el cliente tenga el piloto
 * automático activado para esa intención.
 */

export const ReplyIntentSchema = z.enum([
  "interest",
  "objection",
  "not_now",
  "out_of_office",
  "opt_out",
  "wrong_person",
  "other",
]);
export type ReplyIntent = z.infer<typeof ReplyIntentSchema>;

export const DraftStatusSchema = z.enum(["pending_approval", "approved", "sent", "discarded"]);
export type DraftStatus = z.infer<typeof DraftStatusSchema>;

export const MeetingSlotSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  held: z.boolean(),
});
export type MeetingSlot = z.infer<typeof MeetingSlotSchema>;

export const DraftSchema = z.object({
  channel: ChannelSchema,
  subject: z.string().nullable(),
  body: z.string().min(1),
  slots: z.array(MeetingSlotSchema),
  confidence: z.enum(["alta", "media", "baja"]),
  status: DraftStatusSchema,
});
export type Draft = z.infer<typeof DraftSchema>;

/** Qué hará el motor al aprobar: se muestra antes de pulsar, no después. */
export const ApprovalEffectSchema = z.enum([
  "send_reply",
  "hold_slots",
  "create_opportunity",
  "stop_sequence",
  "add_to_suppression",
  "schedule_follow_up",
]);
export type ApprovalEffect = z.infer<typeof ApprovalEffectSchema>;

export const InboxItemSchema = z.object({
  id: z.string().uuid(),
  prospectId: z.string().uuid(),
  accountName: z.string().min(1),
  contactName: z.string().min(1),
  receivedAt: z.string().datetime(),
  channel: ChannelSchema,
  text: z.string().min(1),
  intent: ReplyIntentSchema,
  intentReasoning: z.string(),
  draft: DraftSchema.nullable(),
  effects: z.array(ApprovalEffectSchema),
});
export type InboxItem = z.infer<typeof InboxItemSchema>;

export const ApproveDraftSchema = z.object({
  body: z.string().min(1).optional(),
  subject: z.string().optional(),
});
export type ApproveDraft = z.infer<typeof ApproveDraftSchema>;

export const RegenerateDraftSchema = z.object({
  tone: z.enum(["mas_breve", "mas_formal", "mas_cercano", "otra_propuesta"]),
});
export type RegenerateDraft = z.infer<typeof RegenerateDraftSchema>;
