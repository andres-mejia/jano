import type { Campaign, CampaignStatus, Icp, IcpTurn, ProspectStage } from "@jano/domain";

import type { RevisionCampana } from "../../ports/ia";
import type { RepositorioCampanas } from "../../ports/repositorios";
import { entero, iso, json, ms } from "./comun";
import type { Tx } from "./tx";

/** Cifras de la campaña: cuentas de su tabla y el resto, proyectado del registro de eventos. */
const COLUMNAS = `c.id, c.name, c.prompt, c.icp::text as icp, c.status, c.meetings_goal,
  ${ms("c.created_at", "created_ms")}, ${ms("c.updated_at", "updated_ms")},
  (select count(*)::int from accounts a where a.campaign_id = c.id) as found,
  (select count(*)::int from accounts a where a.campaign_id = c.id and a.fit_score >= 75 and a.status <> 'discarded') as high_fit,
  (select count(distinct e.prospect_id)::int from prospect_events e where e.campaign_id = c.id and e.stage_after = 'enriched') as verified,
  (select count(distinct e.prospect_id)::int from prospect_events e where e.campaign_id = c.id and e.type = 'sent') as contacted,
  (select count(distinct e.prospect_id)::int from prospect_events e where e.campaign_id = c.id and e.type = 'replied') as replied,
  (select count(distinct e.prospect_id)::int from prospect_events e where e.campaign_id = c.id and e.type = 'meeting_booked') as meetings`;

interface Fila {
  id: string;
  name: string;
  prompt: string;
  icp: string;
  status: CampaignStatus;
  meetings_goal: number;
  created_ms: unknown;
  updated_ms: unknown;
  found: unknown;
  high_fit: unknown;
  verified: unknown;
  contacted: unknown;
  replied: unknown;
  meetings: unknown;
}

const aCampana = (f: Fila): Campaign => ({
  id: f.id,
  name: f.name,
  prompt: f.prompt,
  icp: json<Icp>(f.icp),
  status: f.status,
  meetingsGoal: entero(f.meetings_goal),
  stats: {
    accountsFound: entero(f.found),
    accountsHighFit: entero(f.high_fit),
    contactsVerified: entero(f.verified),
    contacted: entero(f.contacted),
    replied: entero(f.replied),
    meetings: entero(f.meetings),
  },
  createdAt: iso(f.created_ms),
  updatedAt: iso(f.updated_ms),
});

interface FilaTurno {
  role: IcpTurn["role"];
  text: string;
  icp: string | null;
  suggestions: string;
  at_ms: unknown;
}

const aTurno = (f: FilaTurno): IcpTurn => ({
  role: f.role,
  text: f.text,
  ...(f.icp ? { icp: json<Icp>(f.icp) } : {}),
  suggestions: json<string[]>(f.suggestions),
  at: iso(f.at_ms),
});

export function repositorioCampanas(tx: Tx, tenantId: string): RepositorioCampanas {
  const t = { t: tenantId };
  return {
    async crear(c) {
      const [f] = await tx.query<{ id: string }>(
        `insert into campaigns (tenant_id, name, prompt, icp, meetings_goal)
         values (:t, :name, :prompt, cast(:icp as jsonb), :goal) returning id`,
        { ...t, name: c.name, prompt: c.prompt, icp: JSON.stringify(c.icp), goal: c.meetingsGoal },
      );
      if (!f) throw new Error("insert sin returning");
      return f.id;
    },

    async obtener(id) {
      const [f] = await tx.query<Fila>(`select ${COLUMNAS} from campaigns c where c.tenant_id = :t and c.id = cast(:id as uuid)`, { ...t, id });
      return f ? aCampana(f) : null;
    },

    async listar() {
      return (await tx.query<Fila>(`select ${COLUMNAS} from campaigns c where c.tenant_id = :t order by c.created_at desc`, t)).map(aCampana);
    },

    async principal() {
      const [f] = await tx.query<Fila>(
        `select ${COLUMNAS} from campaigns c where c.tenant_id = :t
         order by (c.status = 'active') desc, c.updated_at desc limit 1`,
        t,
      );
      return f ? aCampana(f) : null;
    },

    async cambiarIcp(id, icp: Icp) {
      await tx.query("update campaigns set icp = cast(:icp as jsonb), updated_at = now() where tenant_id = :t and id = cast(:id as uuid)", {
        ...t,
        id,
        icp: JSON.stringify(icp),
      });
    },

    async cambiarEstado(id, status) {
      await tx.query("update campaigns set status = :status, updated_at = now() where tenant_id = :t and id = cast(:id as uuid)", { ...t, id, status });
    },

    async turnos(id) {
      return (
        await tx.query<FilaTurno>(
          `select role, text, icp::text as icp, suggestions::text as suggestions, ${ms("at", "at_ms")}
           from icp_turns where tenant_id = :t and campaign_id = cast(:id as uuid) order by id`,
          { ...t, id },
        )
      ).map(aTurno);
    },

    async anadirTurno(id, turno) {
      const [f] = await tx.query<FilaTurno>(
        `insert into icp_turns (tenant_id, campaign_id, role, text, icp, suggestions)
         values (:t, cast(:id as uuid), :role, :text, cast(:icp as jsonb), cast(:sug as jsonb))
         returning role, text, icp::text as icp, suggestions::text as suggestions, ${ms("at", "at_ms")}`,
        { ...t, id, role: turno.role, text: turno.text, icp: turno.icp ? JSON.stringify(turno.icp) : null, sug: JSON.stringify(turno.suggestions) },
      );
      if (!f) throw new Error("insert sin returning");
      return aTurno(f);
    },

    async guardarRevision(id, r: RevisionCampana) {
      await tx.query(
        `insert into campaign_reviews (tenant_id, campaign_id, reading, bottleneck, proposal)
         values (:t, cast(:id as uuid), :reading, :cuello, cast(:prop as jsonb))`,
        { ...t, id, reading: r.lectura, cuello: r.cuello, prop: r.propuesta ? JSON.stringify(r.propuesta) : null },
      );
    },

    async ultimaRevision(id) {
      const [f] = await tx.query<{ reading: string; bottleneck: ProspectStage | null; proposal: string | null }>(
        `select reading, bottleneck, proposal::text as proposal from campaign_reviews
         where tenant_id = :t and campaign_id = cast(:id as uuid) order by id desc limit 1`,
        { ...t, id },
      );
      return f ? { lectura: f.reading, cuello: f.bottleneck, propuesta: f.proposal ? json<RevisionCampana["propuesta"]>(f.proposal) : null } : null;
    },
  };
}
