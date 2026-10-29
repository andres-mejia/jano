import type { Account, AccountStatus, Contact, DataSource, Evidence, LegalBasisStatus, Trigger } from "@jano/domain";

import type { RepositorioCuentas } from "../../ports/repositorios";
import type { EmpresaCandidata } from "../../ports/web";
import { EN_LISTA, entero, iso, json, listaJson, ms } from "./comun";
import type { Tx } from "./tx";

const COLUMNAS = `id, campaign_id, name, domain, city, cnae, revenue_eur, employees, fit_score, fit_reasoning,
  fit_evidence::text as fit_evidence, trigger::text as trigger, status, ${ms("created_at", "created_ms")}`;

interface Fila {
  id: string;
  campaign_id: string;
  name: string;
  domain: string;
  city: string | null;
  cnae: string | null;
  revenue_eur: unknown;
  employees: unknown;
  fit_score: unknown;
  fit_reasoning: string;
  fit_evidence: string;
  trigger: string | null;
  status: AccountStatus;
  created_ms: unknown;
}

const aCuenta = (f: Fila): Account => ({
  id: f.id,
  campaignId: f.campaign_id,
  name: f.name,
  domain: f.domain,
  city: f.city,
  cnae: f.cnae,
  revenueEur: f.revenue_eur === null ? null : entero(f.revenue_eur),
  employees: f.employees === null ? null : entero(f.employees),
  fitScore: entero(f.fit_score),
  fitReasoning: f.fit_reasoning,
  fitEvidence: json<Evidence[]>(f.fit_evidence),
  trigger: f.trigger ? json<Trigger>(f.trigger) : null,
  status: f.status,
  createdAt: iso(f.created_ms),
});

const COLUMNAS_CONTACTO = `id, account_id, name, role, email, email_source, email_verified, verification_confidence,
  verification_provider, company_whatsapp, legal_basis, ${ms("created_at", "created_ms")}`;

interface FilaContacto {
  id: string;
  account_id: string;
  name: string;
  role: string;
  email: string;
  email_source: DataSource;
  email_verified: boolean;
  verification_confidence: unknown;
  verification_provider: string | null;
  company_whatsapp: string | null;
  legal_basis: LegalBasisStatus;
  created_ms: unknown;
}

export const aContacto = (f: FilaContacto): Contact => ({
  id: f.id,
  accountId: f.account_id,
  name: f.name,
  role: f.role,
  email: f.email,
  emailSource: f.email_source,
  emailVerified: f.email_verified,
  verificationConfidence: f.verification_confidence === null ? null : entero(f.verification_confidence),
  verificationProvider: f.verification_provider,
  companyWhatsapp: f.company_whatsapp,
  legalBasis: f.legal_basis,
  createdAt: iso(f.created_ms),
});

export function repositorioCuentas(tx: Tx, tenantId: string): RepositorioCuentas {
  const t = { t: tenantId };
  return {
    async dominios(campaignId) {
      const filas = await tx.query<{ domain: string }>("select domain from accounts where tenant_id = :t and campaign_id = cast(:c as uuid)", {
        ...t,
        c: campaignId,
      });
      return new Set(filas.map((f) => f.domain));
    },

    async insertar(c) {
      const [f] = await tx.query<Fila>(
        `insert into accounts (tenant_id, campaign_id, name, domain, city, fit_score, fit_reasoning, fit_evidence, trigger, status, source, discard_reason)
         values (:t, cast(:c as uuid), :name, :domain, :city, :fit, :reasoning, cast(:evidence as jsonb), cast(:trigger as jsonb), :status, :source, :reason)
         on conflict (tenant_id, campaign_id, domain) do nothing
         returning ${COLUMNAS}`,
        {
          ...t,
          c: c.campaignId,
          name: c.name,
          domain: c.domain,
          city: c.city,
          fit: c.fitScore,
          reasoning: c.fitReasoning,
          evidence: JSON.stringify(c.fitEvidence),
          trigger: c.trigger ? JSON.stringify(c.trigger) : null,
          status: c.status,
          source: c.source,
          reason: c.discardReason,
        },
      );
      return f ? aCuenta(f) : null;
    },

    async candidatasEnCache(clave, desde) {
      const [f] = await tx.query<{ companies: string }>(
        "select companies::text as companies from candidate_cache where tenant_id = :t and cache_key = :k and fetched_at >= cast(:desde as timestamptz)",
        { ...t, k: clave, desde: desde.toISOString() },
      );
      return f ? json<EmpresaCandidata[]>(f.companies) : null;
    },

    async guardarCandidatas(clave, empresas, en) {
      await tx.query(
        `insert into candidate_cache (tenant_id, cache_key, companies, fetched_at) values (:t, :k, cast(:e as jsonb), cast(:en as timestamptz))
         on conflict (tenant_id, cache_key) do update set companies = excluded.companies, fetched_at = excluded.fetched_at`,
        { ...t, k: clave, e: JSON.stringify(empresas), en: en.toISOString() },
      );
    },

    async obtener(id) {
      const [f] = await tx.query<Fila>(`select ${COLUMNAS} from accounts where tenant_id = :t and id = cast(:id as uuid)`, { ...t, id });
      return f ? aCuenta(f) : null;
    },

    async listar(campaignId, { status, limite }) {
      return (
        await tx.query<Fila>(
          `select ${COLUMNAS} from accounts
           where tenant_id = :t and campaign_id = cast(:c as uuid) and (cast(:status as text) is null or status = :status)
           order by fit_score desc, name limit :limite`,
          { ...t, c: campaignId, status, limite },
        )
      ).map(aCuenta);
    },

    async cambiarEstado(campaignId, ids, desde, hacia) {
      const filas = await tx.query<{ id: string }>(
        `update accounts set status = :hacia, updated_at = now(),
           discard_reason = case when :hacia = 'discarded' then coalesce(discard_reason, 'Descartada a mano') else discard_reason end
         where tenant_id = :t and campaign_id = cast(:c as uuid) and id in ${EN_LISTA("ids")}
           and status in (select value from jsonb_array_elements_text(cast(:desde as jsonb)))
         returning id`,
        { ...t, c: campaignId, ids: listaJson(ids), desde: JSON.stringify(desde), hacia },
      );
      return filas.map((f) => f.id);
    },

    async insertarContacto(c) {
      const [f] = await tx.query<FilaContacto>(
        `insert into contacts (tenant_id, account_id, name, role, email, email_source, email_verified, verification_provider, reasoning)
         values (:t, cast(:a as uuid), :name, :role, :email, :source, :verified, :provider, :reasoning)
         returning ${COLUMNAS_CONTACTO}`,
        {
          ...t,
          a: c.accountId,
          name: c.name,
          role: c.role,
          email: c.email.toLowerCase(),
          source: c.emailSource,
          verified: c.emailVerified,
          provider: c.verificationProvider,
          reasoning: c.reasoning,
        },
      );
      if (!f) throw new Error("insert sin returning");
      return aContacto(f);
    },

    async contacto(id) {
      const [f] = await tx.query<FilaContacto>(`select ${COLUMNAS_CONTACTO} from contacts where tenant_id = :t and id = cast(:id as uuid)`, { ...t, id });
      return f ? aContacto(f) : null;
    },
  };
}
