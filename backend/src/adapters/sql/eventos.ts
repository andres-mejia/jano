import type { Agent, EventType, ProspectEvent, RuleCheck } from "@jano/domain";

import type { RegistroDeEventos } from "../../ports/repositorios";
import { entero, iso, json, ms } from "./comun";
import type { Tx } from "./tx";

/** Registro append-only (ADR-002): aquí solo hay inserts y lecturas. */

export const COLUMNAS_EVENTO = `e.id, e.prospect_id, e.agent, e.type, e.summary, e.reasoning, e.evidence::text as evidence,
  e.rules_checked::text as rules_checked, e.message::text as message, e.step_id, ${ms("e.at", "at_ms")}`;

export interface FilaEvento {
  id: string;
  prospect_id: string;
  agent: Agent;
  type: EventType;
  summary: string;
  reasoning: string | null;
  evidence: string;
  rules_checked: string;
  message: string | null;
  step_id: string | null;
  at_ms: unknown;
}

export const aEvento = (f: FilaEvento): ProspectEvent => ({
  id: f.id,
  prospectId: f.prospect_id,
  at: iso(f.at_ms),
  agent: f.agent,
  type: f.type,
  summary: f.summary,
  reasoning: f.reasoning,
  evidence: json<string[]>(f.evidence),
  rulesChecked: json<RuleCheck[]>(f.rules_checked),
  message: f.message ? json<ProspectEvent["message"]>(f.message) : null,
  stepId: f.step_id,
});

export function registroDeEventos(tx: Tx, tenantId: string): RegistroDeEventos {
  const t = { t: tenantId };
  return {
    async registrar(e) {
      const [f] = await tx.query<FilaEvento>(
        `insert into prospect_events as e (tenant_id, prospect_id, campaign_id, agent, type, summary, reasoning, evidence,
           rules_checked, message, step_id, rule_applied, stage_after, actor)
         values (:t, cast(:p as uuid), cast(:c as uuid), :agent, :type, :summary, :reasoning, cast(:evidence as jsonb),
           cast(:rules as jsonb), cast(:message as jsonb), cast(:step as uuid), :rule, :stage, :actor)
         returning ${COLUMNAS_EVENTO}`,
        {
          ...t,
          p: e.prospectId,
          c: e.campaignId,
          agent: e.agent,
          type: e.type,
          summary: e.summary,
          reasoning: e.reasoning ?? null,
          evidence: JSON.stringify(e.evidence ?? []),
          rules: JSON.stringify(e.rulesChecked ?? []),
          message: e.message ? JSON.stringify(e.message) : null,
          step: e.stepId ?? null,
          rule: e.ruleApplied ?? null,
          stage: e.stageAfter ?? null,
          actor: e.actor ?? null,
        },
      );
      if (!f) throw new Error("insert sin returning");
      return aEvento(f);
    },

    async deProspect(prospectId) {
      return (
        await tx.query<FilaEvento>(`select ${COLUMNAS_EVENTO} from prospect_events e where e.tenant_id = :t and e.prospect_id = cast(:p as uuid) order by e.seq`, {
          ...t,
          p: prospectId,
        })
      ).map(aEvento);
    },

    async respondioDespuesDe(prospectId, desde) {
      const [f] = await tx.query<{ n: unknown }>(
        `select count(*)::int as n from prospect_events
         where tenant_id = :t and prospect_id = cast(:p as uuid) and type = 'replied' and at > cast(:desde as timestamptz)`,
        { ...t, p: prospectId, desde: desde.toISOString() },
      );
      return entero(f?.n) > 0;
    },

    async enviados(prospectId) {
      const [f] = await tx.query<{ n: unknown }>(
        "select count(*)::int as n from prospect_events where tenant_id = :t and prospect_id = cast(:p as uuid) and type = 'sent'",
        { ...t, p: prospectId },
      );
      return entero(f?.n);
    },

    async enviosDesde(desde) {
      const [f] = await tx.query<{ n: unknown }>(
        "select count(*)::int as n from prospect_events where tenant_id = :t and type = 'sent' and at >= cast(:desde as timestamptz)",
        { ...t, desde: desde.toISOString() },
      );
      return entero(f?.n);
    },
  };
}
