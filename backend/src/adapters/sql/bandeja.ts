import type { ApprovalEffect, Channel, Draft, InboxItem, Opportunity, OpportunityStatus, ReplyIntent } from "@jano/domain";

import type { ElementoGuardado, RepositorioBandeja } from "../../ports/repositorios";
import { iso, isoN, json, ms } from "./comun";
import type { Tx } from "./tx";

const COLUMNAS = `i.id, i.prospect_id, a.name as account_name, coalesce(k.name, 'Sin contacto') as contact_name, i.channel, i.text,
  i.intent, i.intent_reasoning, i.draft::text as draft, i.effects::text as effects, i.message_id, ${ms("i.received_at", "received_ms")}`;
const DESDE = `from inbox_items i
  join prospects p on p.id = i.prospect_id
  join accounts a on a.id = p.account_id
  left join contacts k on k.id = p.contact_id`;

interface Fila {
  id: string;
  prospect_id: string;
  account_name: string;
  contact_name: string;
  channel: Channel;
  text: string;
  intent: ReplyIntent;
  intent_reasoning: string;
  draft: string | null;
  effects: string;
  message_id: string | null;
  received_ms: unknown;
}

const aElemento = (f: Fila): ElementoGuardado => ({
  id: f.id,
  prospectId: f.prospect_id,
  accountName: f.account_name,
  contactName: f.contact_name,
  receivedAt: iso(f.received_ms),
  channel: f.channel,
  text: f.text,
  intent: f.intent,
  intentReasoning: f.intent_reasoning,
  draft: f.draft ? json<Draft>(f.draft) : null,
  effects: json<ApprovalEffect[]>(f.effects),
  messageId: f.message_id,
});

const sinMessageId = ({ messageId: _, ...item }: ElementoGuardado): InboxItem => item;

interface FilaOportunidad {
  id: string;
  prospect_id: string;
  campaign_id: string;
  campaign_name: string;
  account_name: string;
  domain: string;
  contact_name: string | null;
  contact_role: string | null;
  contact_email: string | null;
  status: OpportunityStatus;
  start_ms: unknown;
  end_ms: unknown;
  created_ms: unknown;
}

export function repositorioBandeja(tx: Tx, tenantId: string): RepositorioBandeja {
  const t = { t: tenantId };
  return {
    async insertar(e) {
      const [f] = await tx.query<{ id: string }>(
        `insert into inbox_items (tenant_id, prospect_id, received_at, channel, text, intent, intent_reasoning, draft, effects, message_id)
         values (:t, cast(:p as uuid), cast(:recibido as timestamptz), :channel, :text, :intent, :razon, cast(:draft as jsonb), cast(:effects as jsonb), :mid)
         returning id`,
        {
          ...t,
          p: e.prospectId,
          recibido: e.receivedAt.toISOString(),
          channel: e.channel,
          text: e.text,
          intent: e.intent,
          razon: e.intentReasoning,
          draft: e.draft ? JSON.stringify(e.draft) : null,
          effects: JSON.stringify(e.effects),
          mid: e.messageId,
        },
      );
      if (!f) throw new Error("insert sin returning");
      return f.id;
    },

    async obtener(id) {
      const [f] = await tx.query<Fila>(`select ${COLUMNAS} ${DESDE} where i.tenant_id = :t and i.id = cast(:id as uuid) for update of i`, { ...t, id });
      return f ? aElemento(f) : null;
    },

    async listar({ intent, status }) {
      const filas = await tx.query<Fila>(
        `select ${COLUMNAS} ${DESDE}
         where i.tenant_id = :t and (cast(:intent as text) is null or i.intent = :intent)
           and (cast(:status as text) is null or i.draft->>'status' = :status)
         order by (i.draft->>'status' = 'pending_approval') desc nulls last, (i.intent = 'opt_out') desc, i.received_at desc`,
        { ...t, intent, status },
      );
      return filas.map(aElemento).map(sinMessageId);
    },

    async cambiarBorrador(id, draft) {
      await tx.query("update inbox_items set draft = cast(:draft as jsonb), updated_at = now() where tenant_id = :t and id = cast(:id as uuid)", {
        ...t,
        id,
        draft: JSON.stringify(draft),
      });
    },

    async crearOportunidad(o) {
      await tx.query(
        `insert into opportunities (tenant_id, prospect_id, campaign_id, inbox_item_id, meeting_start, meeting_end)
         values (:t, cast(:p as uuid), cast(:c as uuid), cast(:i as uuid), cast(:inicio as timestamptz), cast(:fin as timestamptz))`,
        { ...t, p: o.prospectId, c: o.campaignId, i: o.inboxItemId, inicio: o.meetingStart, fin: o.meetingEnd },
      );
    },

    async oportunidades() {
      const filas = await tx.query<FilaOportunidad>(
        `select o.id, o.prospect_id, o.campaign_id, c.name as campaign_name, a.name as account_name, a.domain,
           k.name as contact_name, k.role as contact_role, k.email as contact_email, o.status,
           ${ms("o.meeting_start", "start_ms")}, ${ms("o.meeting_end", "end_ms")}, ${ms("o.created_at", "created_ms")}
         from opportunities o
         join campaigns c on c.id = o.campaign_id
         join prospects p on p.id = o.prospect_id
         join accounts a on a.id = p.account_id
         left join contacts k on k.id = p.contact_id
         where o.tenant_id = :t order by o.created_at desc`,
        t,
      );
      return filas.map(
        (f): Opportunity => ({
          id: f.id,
          prospectId: f.prospect_id,
          campaignId: f.campaign_id,
          campaignName: f.campaign_name,
          accountName: f.account_name,
          domain: f.domain,
          contactName: f.contact_name,
          contactRole: f.contact_role,
          contactEmail: f.contact_email,
          meetingStart: isoN(f.start_ms),
          meetingEnd: isoN(f.end_ms),
          status: f.status,
          createdAt: iso(f.created_ms),
        }),
      );
    },
  };
}
