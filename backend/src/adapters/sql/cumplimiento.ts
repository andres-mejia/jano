import { DEFAULT_GUARDRAILS, type Guardrails } from "@jano/domain";

import type { RepositorioCumplimiento } from "../../ports/repositorios";
import { entero } from "./comun";
import type { Tx } from "./tx";

interface Fila {
  max_sends_per_mailbox_per_day: unknown;
  require_verified_email: boolean;
  whatsapp_only_after_reply: boolean;
  stop_sequence_on_reply: boolean;
  autopilot: boolean;
}

const COLUMNAS = "max_sends_per_mailbox_per_day, require_verified_email, whatsapp_only_after_reply, stop_sequence_on_reply, autopilot";

const aGuardarrailes = (f: Fila): Guardrails => ({
  maxSendsPerMailboxPerDay: entero(f.max_sends_per_mailbox_per_day),
  requireVerifiedEmail: f.require_verified_email,
  whatsappOnlyAfterReply: f.whatsapp_only_after_reply,
  stopSequenceOnReply: f.stop_sequence_on_reply,
  autopilot: f.autopilot,
});

export function repositorioCumplimiento(tx: Tx, tenantId: string): RepositorioCumplimiento {
  const t = { t: tenantId };
  return {
    async guardarrailes() {
      const [f] = await tx.query<Fila>(`select ${COLUMNAS} from guardrails where tenant_id = :t`, t);
      return f ? aGuardarrailes(f) : { ...DEFAULT_GUARDRAILS };
    },

    async guardarGuardarrailes(g, actor) {
      const [f] = await tx.query<Fila>(
        `insert into guardrails (tenant_id, ${COLUMNAS}, updated_by)
         values (:t, :max, :verified, :whatsapp, :stop, :autopilot, :actor)
         on conflict (tenant_id) do update set
           max_sends_per_mailbox_per_day = excluded.max_sends_per_mailbox_per_day,
           require_verified_email = excluded.require_verified_email,
           whatsapp_only_after_reply = excluded.whatsapp_only_after_reply,
           stop_sequence_on_reply = excluded.stop_sequence_on_reply,
           autopilot = excluded.autopilot, updated_by = excluded.updated_by, updated_at = now()
         returning ${COLUMNAS}`,
        {
          ...t,
          max: g.maxSendsPerMailboxPerDay,
          verified: g.requireVerifiedEmail,
          whatsapp: g.whatsappOnlyAfterReply,
          stop: g.stopSequenceOnReply,
          autopilot: g.autopilot,
          actor,
        },
      );
      if (!f) throw new Error("upsert sin returning");
      return aGuardarrailes(f);
    },

    async suprimido(email) {
      const [f] = await tx.query<{ n: unknown }>("select count(*)::int as n from suppression_list where tenant_id = :t and email = :e", {
        ...t,
        e: email.toLowerCase(),
      });
      return entero(f?.n) > 0;
    },

    async suprimir(email, source, prospectId) {
      await tx.query(
        `insert into suppression_list (tenant_id, email, source, prospect_id)
         values (:t, :e, :source, cast(:p as uuid)) on conflict (tenant_id, email) do nothing`,
        { ...t, e: email.toLowerCase(), source, p: prospectId },
      );
    },

    async contactos() {
      const [f] = await tx.query<{ total: unknown; con_origen: unknown; validada: unknown }>(
        `select count(*)::int as total, count(email_source)::int as con_origen,
           count(*) filter (where legal_basis = 'validated')::int as validada
         from contacts where tenant_id = :t`,
        t,
      );
      return { total: entero(f?.total), conOrigen: entero(f?.con_origen), baseValidada: entero(f?.validada) };
    },

    async bajas() {
      const [f] = await tx.query<{ total: unknown; atendidas: unknown }>(
        `select (select count(distinct prospect_id)::int from prospect_events where tenant_id = :t and type = 'opt_out') as total,
           (select count(*)::int from suppression_list where tenant_id = :t and source in ('enlace_baja', 'respuesta')) as atendidas`,
        t,
      );
      return { total: entero(f?.total), atendidas: entero(f?.atendidas) };
    },
  };
}
