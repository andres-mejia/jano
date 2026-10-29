import type { Agent, AuditEntry, EventType, ProspectStage, ReplyIntent } from "@jano/domain";

import type { Proyecciones } from "../../ports/repositorios";
import { entero, iso, ms } from "./comun";
import { aEvento, COLUMNAS_EVENTO, type FilaEvento } from "./eventos";
import type { Tx } from "./tx";

/**
 * Proyecciones del registro de eventos (FR-006). La etapa actual de un prospect es
 * el último `stage_after` de sus eventos; «alcanzó» una etapa si algún evento lo
 * llevó a ella. Las cuentas salen de su tabla: no son prospects todavía.
 */

const ACTUAL = `select distinct on (prospect_id) prospect_id, stage_after as stage
  from prospect_events where tenant_id = :t and campaign_id = cast(:c as uuid) and stage_after is not null
  order by prospect_id, seq desc`;

const porEtapa = (filas: { stage: ProspectStage; n: unknown }[]) =>
  Object.fromEntries(filas.map((f) => [f.stage, entero(f.n)])) as Partial<Record<ProspectStage, number>>;

export function proyecciones(tx: Tx, tenantId: string): Proyecciones {
  const t = { t: tenantId };
  return {
    async actuales(campaignId) {
      return porEtapa(await tx.query(`select stage, count(*)::int as n from (${ACTUAL}) x group by stage`, { ...t, c: campaignId }));
    },

    async alcanzadas(campaignId) {
      return porEtapa(
        await tx.query(
          `select stage_after as stage, count(distinct prospect_id)::int as n from prospect_events
           where tenant_id = :t and campaign_id = cast(:c as uuid) and stage_after is not null group by stage_after`,
          { ...t, c: campaignId },
        ),
      );
    },

    async cuentas(campaignId) {
      const [f] = await tx.query<Record<string, unknown>>(
        `select count(*)::int as total,
           count(*) filter (where fit_score >= 75 and status <> 'discarded')::int as fit_alto,
           count(*) filter (where status = 'discarded')::int as descartadas,
           count(*) filter (where status = 'found')::int as por_revisar
         from accounts where tenant_id = :t and campaign_id = cast(:c as uuid)`,
        { ...t, c: campaignId },
      );
      return { total: entero(f?.["total"]), fitAlto: entero(f?.["fit_alto"]), descartadas: entero(f?.["descartadas"]), porRevisar: entero(f?.["por_revisar"]) };
    },

    async embudo(campaignId) {
      const [f] = await tx.query<Record<string, unknown>>(
        `select count(distinct prospect_id) filter (where type = 'sent')::int as contactados,
           count(distinct prospect_id) filter (where type = 'replied')::int as respondieron,
           count(distinct prospect_id) filter (where type = 'meeting_booked')::int as reuniones
         from prospect_events where tenant_id = :t and campaign_id = cast(:c as uuid)`,
        { ...t, c: campaignId },
      );
      return { contactados: entero(f?.["contactados"]), respondieron: entero(f?.["respondieron"]), reuniones: entero(f?.["reuniones"]) };
    },

    async tendencias(campaignId, ahora) {
      const filas = await tx.query<Record<string, unknown>>(
        `select d.fin,
           (select count(*)::int from accounts a where a.tenant_id = :t and a.campaign_id = cast(:c as uuid) and a.created_at < d.fin) as cuentas,
           (select count(distinct e.prospect_id)::int from prospect_events e
              where e.tenant_id = :t and e.campaign_id = cast(:c as uuid) and e.stage_after = 'enriched' and e.at < d.fin) as contactos,
           (select count(distinct e.prospect_id)::int from prospect_events e
              where e.tenant_id = :t and e.campaign_id = cast(:c as uuid) and e.type = 'replied' and e.at < d.fin) as conversaciones,
           (select count(distinct e.prospect_id)::int from prospect_events e
              where e.tenant_id = :t and e.campaign_id = cast(:c as uuid) and e.type = 'meeting_booked' and e.at < d.fin) as reuniones
         from (select cast(:ahora as timestamptz) - (i * interval '1 day') as fin from generate_series(5, 0, -1) as i) d
         order by d.fin`,
        { ...t, c: campaignId, ahora: ahora.toISOString() },
      );
      const serie = (k: string) => filas.map((f) => entero(f[k]));
      return { cuentas: serie("cuentas"), contactos: serie("contactos"), conversaciones: serie("conversaciones"), reuniones: serie("reuniones") };
    },

    async eventosEnEtapa(campaignId, stage, limite) {
      return (
        await tx.query<FilaEvento>(
          `select ${COLUMNAS_EVENTO} from prospect_events e
           join (${ACTUAL}) x on x.prospect_id = e.prospect_id and x.stage = :stage
           where e.tenant_id = :t order by e.seq desc limit :limite`,
          { ...t, c: campaignId, stage, limite },
        )
      ).map(aEvento);
    },

    async auditoria(limite) {
      const filas = await tx.query<{
        id: string;
        agent: Agent;
        type: EventType;
        prospect_id: string;
        account_name: string | null;
        summary: string;
        rule_applied: string | null;
        at_ms: unknown;
      }>(
        `select e.id, e.agent, e.type, e.prospect_id, a.name as account_name, e.summary, e.rule_applied, ${ms("e.at", "at_ms")}
         from prospect_events e join prospects p on p.id = e.prospect_id left join accounts a on a.id = p.account_id
         where e.tenant_id = :t order by e.seq desc limit :limite`,
        { ...t, limite },
      );
      return filas.map(
        (f): AuditEntry => ({
          id: f.id,
          at: iso(f.at_ms),
          agent: f.agent,
          type: f.type,
          prospectId: f.prospect_id,
          accountName: f.account_name,
          summary: f.summary,
          ruleApplied: f.rule_applied,
        }),
      );
    },

    async ultimaActividad(campaignId) {
      const filas = await tx.query<{ agent: Agent; summary: string; at_ms: unknown }>(
        `select distinct on (agent) agent, summary, ${ms("at", "at_ms")} from prospect_events
         where tenant_id = :t and campaign_id = cast(:c as uuid) and agent <> 'human'
         order by agent, seq desc`,
        { ...t, c: campaignId },
      );
      return filas.map((f) => ({ agent: f.agent, summary: f.summary, at: iso(f.at_ms) }));
    },

    async pendientes() {
      const borradores = await tx.query<{ id: string; account_name: string; intent: ReplyIntent }>(
        `select i.id, a.name as account_name, i.intent from inbox_items i
         join prospects p on p.id = i.prospect_id join accounts a on a.id = p.account_id
         where i.tenant_id = :t and i.draft->>'status' = 'pending_approval' order by i.received_at desc limit 10`,
        t,
      );
      const pasos = await tx.query<{ prospect_id: string; id: string; account_name: string; title: string }>(
        `select s.prospect_id, s.id, a.name as account_name, s.title from sequence_steps s
         join prospects p on p.id = s.prospect_id join accounts a on a.id = p.account_id
         where s.tenant_id = :t and s.status = 'awaiting_approval' order by s.updated_at desc limit 10`,
        t,
      );
      return {
        borradores: borradores.map((b) => ({ id: b.id, accountName: b.account_name, intent: b.intent })),
        pasos: pasos.map((p) => ({ prospectId: p.prospect_id, stepId: p.id, accountName: p.account_name, title: p.title })),
      };
    },

    async reunionesPorSemana(ahora, semanas) {
      const filas = await tx.query<{ semana: string; n: unknown }>(
        `select 'S' || to_char(w.inicio, 'IW') as semana,
           (select count(*)::int from prospect_events e where e.tenant_id = :t and e.type = 'meeting_booked'
              and e.at >= w.inicio and e.at < w.inicio + interval '1 week') as n
         from (select date_trunc('week', cast(:ahora as timestamptz)) - (i * interval '1 week') as inicio
               from generate_series(cast(:semanas as int) - 1, 0, -1) as i) w
         order by w.inicio`,
        { ...t, ahora: ahora.toISOString(), semanas },
      );
      return filas.map((f) => ({ week: f.semana, count: entero(f.n) }));
    },

    async proximasReuniones(ahora) {
      const filas = await tx.query<{ id: string; account_name: string; contact_name: string | null; start_ms: unknown }>(
        `select o.id, a.name as account_name, k.name as contact_name, ${ms("o.meeting_start", "start_ms")}
         from opportunities o join prospects p on p.id = o.prospect_id join accounts a on a.id = p.account_id
         left join contacts k on k.id = p.contact_id
         where o.tenant_id = :t and o.meeting_start >= cast(:ahora as timestamptz) order by o.meeting_start limit 5`,
        { ...t, ahora: ahora.toISOString() },
      );
      return filas.map((f) => ({ id: f.id, accountName: f.account_name, contactName: f.contact_name ?? "Sin contacto", start: iso(f.start_ms) }));
    },

    async aplazadosDesde(desde) {
      const [f] = await tx.query<{ n: unknown }>(
        "select count(*)::int as n from prospect_events where tenant_id = :t and type = 'deferred' and at >= cast(:desde as timestamptz)",
        { ...t, desde: desde.toISOString() },
      );
      return entero(f?.n);
    },
  };
}
