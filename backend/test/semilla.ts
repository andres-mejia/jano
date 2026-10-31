import type { TenantRole, TenantUserStatus } from "@jano/domain";

import type { PgDb } from "../src/adapters/pg-db";

/** Empresas y personas inventadas, con dominios `.example` (AGENTS.md §5). */
export const A = { id: "tenant-faro", name: "Faro Ingeniería", owner: "ana@faro.example" } as const;
export const B = { id: "tenant-brisa", name: "Brisa Logística", owner: "bruno@brisa.example" } as const;

/** Tablas del motor (002), en orden de dependencias. */
export const TABLAS_MOTOR = [
  "campaigns",
  "icp_turns",
  "accounts",
  "contacts",
  "prospects",
  "sequence_steps",
  "prospect_events",
  "inbox_items",
  "opportunities",
  "suppression_list",
  "campaign_reviews",
  "guardrails",
  "candidate_cache",
  "ai_usage",
] as const;

/**
 * Una fila en cada tabla del motor para el tenant, con SQL directo y el propietario.
 * Devuelve los ids y el token del prospect. El paso queda vencido.
 */
export async function sembrarMotor(admin: PgDb, tenantId: string, dominio: string) {
  return admin.enTenantSql(tenantId, async (tx) => {
    const t = { t: tenantId };
    const [c] = await tx.query<{ id: string }>(
      `insert into campaigns (tenant_id, name, prompt, icp, meetings_goal)
       values (:t, 'Agencias', 'Agencias de viajes en Valencia', '{"sector":"Agencias de viajes"}', 5) returning id`,
      t,
    );
    const campaign = c?.id ?? "";
    await tx.query("insert into icp_turns (tenant_id, campaign_id, role, text) values (:t, cast(:c as uuid), 'user', 'hola')", { ...t, c: campaign });
    const [a] = await tx.query<{ id: string }>(
      `insert into accounts (tenant_id, campaign_id, name, domain, fit_score, fit_reasoning, status, source)
       values (:t, cast(:c as uuid), 'Viajes de prueba', :d, 80, 'encaja', 'approved', 'manual') returning id`,
      { ...t, c: campaign, d: dominio },
    );
    const account = a?.id ?? "";
    const [k] = await tx.query<{ id: string }>(
      `insert into contacts (tenant_id, account_id, name, role, email, email_source)
       values (:t, cast(:a as uuid), 'Dirección (prueba)', 'Dirección', :e, 'proveedor') returning id`,
      { ...t, a: account, e: `prueba@${dominio}` },
    );
    const [p] = await tx.query<{ id: string; token: string }>(
      `insert into prospects (tenant_id, campaign_id, account_id, contact_id, stage)
       values (:t, cast(:c as uuid), cast(:a as uuid), cast(:k as uuid), 'in_sequence') returning id, token`,
      { ...t, c: campaign, a: account, k: k?.id ?? "" },
    );
    const prospect = p?.id ?? "";
    const [s] = await tx.query<{ id: string }>(
      `insert into sequence_steps (tenant_id, prospect_id, branch, position, day, channel, title, intent, status, scheduled_for)
       values (:t, cast(:p as uuid), 'consultiva', 0, 0, 'email', 'Primer contacto', 'presentarse', 'planned', now() - interval '1 minute')
       returning id`,
      { ...t, p: prospect },
    );
    await tx.query(
      `insert into prospect_events (tenant_id, prospect_id, campaign_id, agent, type, summary)
       values (:t, cast(:p as uuid), cast(:c as uuid), 'outreach', 'decision', 'Elige secuencia')`,
      { ...t, p: prospect, c: campaign },
    );
    const [i] = await tx.query<{ id: string }>(
      `insert into inbox_items (tenant_id, prospect_id, received_at, channel, text, intent, intent_reasoning)
       values (:t, cast(:p as uuid), now(), 'email', 'Me interesa', 'interest', 'pide más') returning id`,
      { ...t, p: prospect },
    );
    await tx.query(
      `insert into opportunities (tenant_id, prospect_id, campaign_id, inbox_item_id)
       values (:t, cast(:p as uuid), cast(:c as uuid), cast(:i as uuid))`,
      { ...t, p: prospect, c: campaign, i: i?.id ?? "" },
    );
    await tx.query("insert into suppression_list (tenant_id, email, source) values (:t, :e, 'manual')", { ...t, e: `baja@${dominio}` });
    await tx.query("insert into campaign_reviews (tenant_id, campaign_id, reading) values (:t, cast(:c as uuid), 'sin cuello')", { ...t, c: campaign });
    await tx.query("insert into guardrails (tenant_id) values (:t)", t);
    await tx.query("insert into candidate_cache (tenant_id, cache_key, companies) values (:t, 'osm:valencia', '[]')", t);
    await tx.query("insert into ai_usage (tenant_id, day, calls) values (:t, current_date, 1)", t);
    return { campaign, account, prospect, step: s?.id ?? "", token: p?.token ?? "" };
  });
}

export async function sembrarTenant(
  admin: PgDb,
  t: { id: string; name: string; owner: string },
  extra: { email: string; role: TenantRole; status: TenantUserStatus }[] = [],
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  await admin.enTenant(t.id, async ({ equipo }) => {
    await equipo.crearTenant({ id: t.id, name: t.name });
    for (const u of [{ email: t.owner, role: "owner" as const, status: "active" as const }, ...extra]) {
      const userId = `sub-${u.email}`;
      await equipo.insertar({ userId, email: u.email, name: null, role: u.role, status: u.status, invitedBy: "ops" });
      ids[u.email] = userId;
    }
  });
  return ids;
}
