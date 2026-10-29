import type { Channel, ProspectStage, SequenceKind, StepStatus } from "@jano/domain";

import type { CambiosPaso, PasoGuardado, ProspectGuardado, RepositorioProspects } from "../../ports/repositorios";
import { EN_LISTA, entero, iso, isoN, listaJson, ms } from "./comun";
import type { Tx } from "./tx";

const COLUMNAS = `id, campaign_id, account_id, contact_id, stage, sequence_id, sequence_kind, switched_from, token,
  ${ms("switched_at", "switched_ms")}, ${ms("updated_at", "updated_ms")}`;

interface Fila {
  id: string;
  campaign_id: string;
  account_id: string;
  contact_id: string | null;
  stage: ProspectStage;
  sequence_id: string | null;
  sequence_kind: SequenceKind | null;
  switched_from: SequenceKind | null;
  token: string;
  switched_ms: unknown;
  updated_ms: unknown;
}

const aProspect = (f: Fila): ProspectGuardado => ({
  id: f.id,
  campaignId: f.campaign_id,
  accountId: f.account_id,
  contactId: f.contact_id,
  stage: f.stage,
  sequenceId: f.sequence_id,
  sequenceKind: f.sequence_kind,
  switchedFrom: f.switched_from,
  switchedAt: isoN(f.switched_ms),
  token: f.token,
  updatedAt: iso(f.updated_ms),
});

const COLUMNAS_PASO = `id, prospect_id, branch, position, day, channel, title, intent, status, proposal, subject, body, error, message_id,
  ${ms("scheduled_for", "scheduled_ms")}, ${ms("approved_at", "approved_ms")}, ${ms("created_at", "created_ms")}`;

interface FilaPaso {
  id: string;
  prospect_id: string;
  branch: SequenceKind;
  position: unknown;
  day: unknown;
  channel: Channel;
  title: string;
  intent: string;
  status: StepStatus;
  proposal: "cambio_de_rama" | null;
  subject: string | null;
  body: string | null;
  error: string | null;
  message_id: string | null;
  scheduled_ms: unknown;
  approved_ms: unknown;
  created_ms: unknown;
}

const aPaso = (f: FilaPaso): PasoGuardado => ({
  id: f.id,
  prospectId: f.prospect_id,
  branch: f.branch,
  position: entero(f.position),
  day: entero(f.day),
  channel: f.channel,
  title: f.title,
  intent: f.intent,
  status: f.status,
  scheduledFor: isoN(f.scheduled_ms),
  proposal: f.proposal,
  subject: f.subject,
  body: f.body,
  approvedAt: isoN(f.approved_ms),
  error: f.error,
  messageId: f.message_id,
  createdAt: iso(f.created_ms),
});

/** Columna de `CambiosPaso` → (columna SQL, conversión del valor). */
const CAMPOS: Readonly<Record<keyof CambiosPaso, string>> = {
  status: "status",
  scheduledFor: "scheduled_for",
  subject: "subject",
  body: "body",
  draftReasoning: "draft_reasoning",
  approvedAt: "approved_at",
  approvedBy: "approved_by",
  error: "error",
  messageId: "message_id",
  sentAt: "sent_at",
};
const FECHAS: ReadonlySet<string> = new Set(["scheduledFor", "approvedAt", "sentAt"]);

export function repositorioProspects(tx: Tx, tenantId: string): RepositorioProspects {
  const t = { t: tenantId };
  return {
    async crear(p) {
      const [f] = await tx.query<Fila>(
        `insert into prospects (tenant_id, campaign_id, account_id, contact_id, stage)
         values (:t, cast(:c as uuid), cast(:a as uuid), cast(:k as uuid), :stage) returning ${COLUMNAS}`,
        { ...t, c: p.campaignId, a: p.accountId, k: p.contactId, stage: p.stage },
      );
      if (!f) throw new Error("insert sin returning");
      return aProspect(f);
    },

    async obtener(id) {
      const [f] = await tx.query<Fila>(`select ${COLUMNAS} from prospects where tenant_id = :t and id = cast(:id as uuid) for update`, { ...t, id });
      return f ? aProspect(f) : null;
    },

    async cambiarEtapa(id, stage) {
      await tx.query("update prospects set stage = :stage, updated_at = now() where tenant_id = :t and id = cast(:id as uuid)", { ...t, id, stage });
    },

    async fijarSecuencia(id, s) {
      await tx.query(
        `update prospects set sequence_id = coalesce(sequence_id, gen_random_uuid()), sequence_kind = :kind,
           switched_from = :desde, switched_at = cast(:cuando as timestamptz), updated_at = now()
         where tenant_id = :t and id = cast(:id as uuid)`,
        { ...t, id, kind: s.kind, desde: s.switchedFrom, cuando: s.switchedAt?.toISOString() ?? null },
      );
    },

    async pasos(prospectId) {
      return (
        await tx.query<FilaPaso>(`select ${COLUMNAS_PASO} from sequence_steps where tenant_id = :t and prospect_id = cast(:p as uuid) order by position`, {
          ...t,
          p: prospectId,
        })
      ).map(aPaso);
    },

    async paso(id) {
      const [f] = await tx.query<FilaPaso>(`select ${COLUMNAS_PASO} from sequence_steps where tenant_id = :t and id = cast(:id as uuid) for update`, {
        ...t,
        id,
      });
      return f ? aPaso(f) : null;
    },

    async insertarPasos(prospectId, pasos) {
      const hechos: PasoGuardado[] = [];
      for (const p of pasos) {
        const [f] = await tx.query<FilaPaso>(
          `insert into sequence_steps (tenant_id, prospect_id, branch, position, day, channel, title, intent, status, scheduled_for, proposal)
           values (:t, cast(:p as uuid), :branch, :position, :day, :channel, :title, :intent, :status, cast(:cuando as timestamptz), :proposal)
           returning ${COLUMNAS_PASO}`,
          {
            ...t,
            p: prospectId,
            branch: p.branch,
            position: p.position,
            day: p.day,
            channel: p.channel,
            title: p.title,
            intent: p.intent,
            status: p.status,
            cuando: p.scheduledFor?.toISOString() ?? null,
            proposal: p.proposal,
          },
        );
        if (!f) throw new Error("insert sin returning");
        hechos.push(aPaso(f));
      }
      return hechos;
    },

    async actualizarPaso(id, cambios) {
      const entradas = Object.entries(cambios).filter(([, v]) => v !== undefined) as [keyof CambiosPaso, unknown][];
      if (!entradas.length) return;
      const sets = entradas.map(([k]) => (FECHAS.has(k) ? `${CAMPOS[k]} = cast(:${k} as timestamptz)` : `${CAMPOS[k]} = :${k}`));
      const params = Object.fromEntries(entradas.map(([k, v]) => [k, v instanceof Date ? v.toISOString() : (v as string | null)]));
      await tx.query(`update sequence_steps set ${sets.join(", ")}, updated_at = now() where tenant_id = :t and id = cast(:id as uuid)`, {
        ...t,
        ...params,
        id,
      });
    },

    async marcarPasos(ids, status) {
      if (!ids.length) return;
      await tx.query(`update sequence_steps set status = :status, updated_at = now() where tenant_id = :t and id in ${EN_LISTA("ids")}`, {
        ...t,
        ids: listaJson(ids),
        status,
      });
    },

    async reclamarVencidos(ahora, limite) {
      return (
        await tx.query<FilaPaso>(
          `select ${COLUMNAS_PASO} from sequence_steps
           where tenant_id = :t and status = 'planned' and scheduled_for <= cast(:ahora as timestamptz)
           order by scheduled_for limit :limite for update skip locked`,
          { ...t, ahora: ahora.toISOString(), limite },
        )
      ).map(aPaso);
    },

    async proximoVencimiento() {
      const [f] = await tx.query<{ proximo: unknown }>(
        `select ${ms("min(scheduled_for)", "proximo")} from sequence_steps where tenant_id = :t and status = 'planned' and scheduled_for is not null`,
        t,
      );
      return f?.proximo === null || f?.proximo === undefined ? null : new Date(Number(f.proximo));
    },
  };
}
