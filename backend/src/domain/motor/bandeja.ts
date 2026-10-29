import type { ApprovalEffect, ReplyIntent } from "@jano/domain";

/**
 * Qué hará el motor al aprobar el borrador de cada intención: se muestra antes de
 * pulsar. Una baja no espera aprobación: sus efectos se aplican al llegar.
 */
export const EFECTOS: Readonly<Record<ReplyIntent, readonly ApprovalEffect[]>> = {
  interest: ["send_reply", "hold_slots", "create_opportunity"],
  objection: ["send_reply"],
  not_now: ["send_reply", "schedule_follow_up"],
  out_of_office: ["schedule_follow_up"],
  opt_out: ["add_to_suppression", "stop_sequence"],
  wrong_person: ["send_reply"],
  other: ["send_reply"],
};

/** «Ahora no»: se retoma pasados 90 días de secuencia. */
export const DIAS_SEGUIMIENTO_AHORA_NO = 90;
