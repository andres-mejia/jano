-- 002 · Motor y datos de la prueba de concepto (spec 008 FR-001, ADR-002, ADR-003).
--
-- Mismo aislamiento que 001: tenant_id en cada tabla, ENABLE + FORCE ROW LEVEL
-- SECURITY y política sobre `app.tenant_id`. jano_api recibe lo mínimo: nada de
-- DELETE, y en las tablas append-only (prospect_events, icp_turns,
-- suppression_list) solo SELECT e INSERT.
--
-- Dos accesos que no llevan tenant y que la base de datos acota igualmente:
--   - El motor descubre qué tenants tienen pasos vencidos con el rol jano_motor
--     (SET LOCAL ROLE dentro de una transacción de jano_api), que solo puede leer
--     tenant_id, status y scheduled_for de sequence_steps.
--   - La baja pública y la entrada de respuestas resuelven el token opaco de un
--     prospect con `app.token`: la política por_token deja ver esa fila y ninguna más.
--
-- Las fechas de los pasos son datos (ADR-003): esperar, reintentar o cambiar de
-- rama es cambiar scheduled_for y status, no estado de un workflow externo.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jano_motor') THEN
    CREATE ROLE jano_motor NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO jano_motor;
-- Sin herencia: jano_api solo tiene lo de jano_motor tras un SET ROLE explícito. Con
-- herencia, la política motor_descubre le alcanzaría en cada sesión.
GRANT jano_motor TO jano_api WITH INHERIT FALSE, SET TRUE;

CREATE TABLE campaigns (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL REFERENCES tenants (id),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  prompt        text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 500),
  icp           jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'finished')),
  meetings_goal integer NOT NULL CHECK (meetings_goal BETWEEN 1 AND 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_tenant ON campaigns (tenant_id, updated_at DESC);

-- Diálogo con el Orquestador, append-only: cada corrección queda como turno.
CREATE TABLE icp_turns (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id   text NOT NULL REFERENCES tenants (id),
  campaign_id uuid NOT NULL REFERENCES campaigns (id),
  role        text NOT NULL CHECK (role IN ('user', 'jano')),
  text        text NOT NULL,
  icp         jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]',
  at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX icp_turns_campaign ON icp_turns (tenant_id, campaign_id, id);

-- `source`: de dónde salió la candidata (`osm:<tipo>/<id>`, `manual`); `discard_reason`
-- explica un descarte (web caída, robots.txt, decisión humana).
CREATE TABLE accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text NOT NULL REFERENCES tenants (id),
  campaign_id    uuid NOT NULL REFERENCES campaigns (id),
  name           text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  domain         text NOT NULL CHECK (domain = lower(domain)),
  city           text,
  cnae           text,
  revenue_eur    bigint CHECK (revenue_eur >= 0),
  employees      integer CHECK (employees >= 0),
  fit_score      integer NOT NULL CHECK (fit_score BETWEEN 0 AND 100),
  fit_reasoning  text NOT NULL,
  fit_evidence   jsonb NOT NULL DEFAULT '[]',
  trigger        jsonb,
  status         text NOT NULL CHECK (status IN ('found', 'approved', 'discarded', 'enriching', 'contacted')),
  source         text NOT NULL,
  discard_reason text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, campaign_id, domain)
);
CREATE INDEX accounts_campaign ON accounts (tenant_id, campaign_id, fit_score DESC);

-- Cada dato de contacto guarda su origen (AGENTS.md §3). En la prueba de concepto
-- el nombre es «Cargo (prueba)» y el email, un alias de la lista blanca (FR-015).
CREATE TABLE contacts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               text NOT NULL REFERENCES tenants (id),
  account_id              uuid NOT NULL REFERENCES accounts (id),
  name                    text NOT NULL,
  role                    text NOT NULL,
  email                   text NOT NULL CHECK (email = lower(email)),
  email_source            text NOT NULL CHECK (email_source IN ('registro', 'web', 'prensa', 'linkedin', 'proveedor')),
  email_verified          boolean NOT NULL DEFAULT false,
  verification_confidence integer CHECK (verification_confidence BETWEEN 0 AND 100),
  verification_provider   text,
  company_whatsapp        text,
  legal_basis             text NOT NULL DEFAULT 'pending' CHECK (legal_basis IN ('pending', 'validated', 'rejected')),
  reasoning               text,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_account ON contacts (tenant_id, account_id);

-- Estado del prospect: máquina de estados de @jano/domain (PROSPECT_TRANSITIONS).
-- `token` es opaco y va en el Reply-To y en el enlace de baja (FR-020, FR-022).
CREATE TABLE prospects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text NOT NULL REFERENCES tenants (id),
  campaign_id    uuid NOT NULL REFERENCES campaigns (id),
  account_id     uuid NOT NULL UNIQUE REFERENCES accounts (id),
  contact_id     uuid REFERENCES contacts (id),
  stage          text NOT NULL CHECK (stage IN (
                   'found', 'enriched', 'unverified', 'in_sequence', 'waiting',
                   'replied', 'meeting', 'not_now', 'opted_out', 'discarded')),
  sequence_id    uuid,
  sequence_kind  text CHECK (sequence_kind IN ('consultiva', 'trigger')),
  switched_from  text CHECK (switched_from IN ('consultiva', 'trigger')),
  switched_at    timestamptz,
  token          text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prospects_campaign ON prospects (tenant_id, campaign_id);

-- Un paso de secuencia. `branch` es la rama a la que pertenece; `approved_at` marca
-- que una persona ya lo aprobó (un paso aplazado por el límite diario sale solo al
-- día siguiente); `proposal = 'cambio_de_rama'` es el primer paso de la rama por
-- señal propuesto por Outreach, y aprobarlo aplica el cambio (US4b).
CREATE TABLE sequence_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      text NOT NULL REFERENCES tenants (id),
  prospect_id    uuid NOT NULL REFERENCES prospects (id),
  branch         text NOT NULL CHECK (branch IN ('consultiva', 'trigger')),
  position       integer NOT NULL CHECK (position >= 0),
  day            integer NOT NULL CHECK (day >= 0),
  channel        text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  title          text NOT NULL,
  intent         text NOT NULL,
  status         text NOT NULL CHECK (status IN ('planned', 'awaiting_approval', 'sent', 'skipped', 'cancelled', 'blocked')),
  scheduled_for  timestamptz,
  proposal       text CHECK (proposal IN ('cambio_de_rama')),
  subject        text,
  body           text,
  draft_reasoning text,
  approved_at    timestamptz,
  approved_by    text,
  error          text,
  message_id     text,
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sequence_steps_prospect ON sequence_steps (tenant_id, prospect_id, position);
CREATE INDEX sequence_steps_vencidos ON sequence_steps (scheduled_for) WHERE status = 'planned';

-- Registro append-only (ADR-002): la API solo inserta y lee. `stage_after` es la
-- etapa a la que llevó el evento, si cambió: el flujo, el centro de mando y la
-- auditoría se proyectan de aquí (FR-006), sin tablas de contadores.
CREATE TABLE prospect_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL REFERENCES tenants (id),
  prospect_id   uuid NOT NULL REFERENCES prospects (id),
  campaign_id   uuid NOT NULL REFERENCES campaigns (id),
  at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  agent         text NOT NULL CHECK (agent IN ('orchestrator', 'account_finder', 'contact_finder', 'outreach', 'response', 'guardrail', 'human')),
  type          text NOT NULL CHECK (type IN ('decision', 'sent', 'blocked', 'deferred', 'stopped', 'replied', 'approved', 'rejected', 'opt_out', 'meeting_booked')),
  summary       text NOT NULL CHECK (char_length(summary) >= 1),
  reasoning     text,
  evidence      jsonb NOT NULL DEFAULT '[]',
  rules_checked jsonb NOT NULL DEFAULT '[]',
  message       jsonb,
  step_id       uuid REFERENCES sequence_steps (id),
  rule_applied  text,
  stage_after   text CHECK (stage_after IN (
                  'found', 'enriched', 'unverified', 'in_sequence', 'waiting',
                  'replied', 'meeting', 'not_now', 'opted_out', 'discarded')),
  actor         text,
  -- Orden total: dos eventos de la misma transacción pueden compartir instante.
  seq           bigint GENERATED ALWAYS AS IDENTITY UNIQUE
);
CREATE INDEX prospect_events_prospect ON prospect_events (tenant_id, prospect_id, seq);
CREATE INDEX prospect_events_campaign ON prospect_events (tenant_id, campaign_id, at DESC);
CREATE INDEX prospect_events_type ON prospect_events (tenant_id, type, at DESC);

CREATE TABLE inbox_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        text NOT NULL REFERENCES tenants (id),
  prospect_id      uuid NOT NULL REFERENCES prospects (id),
  received_at      timestamptz NOT NULL,
  channel          text NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  text             text NOT NULL CHECK (char_length(text) >= 1),
  intent           text NOT NULL CHECK (intent IN ('interest', 'objection', 'not_now', 'out_of_office', 'opt_out', 'wrong_person', 'other')),
  intent_reasoning text NOT NULL,
  draft            jsonb,
  effects          jsonb NOT NULL DEFAULT '[]',
  message_id       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbox_items_tenant ON inbox_items (tenant_id, received_at DESC);

CREATE TABLE opportunities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL REFERENCES tenants (id),
  prospect_id   uuid NOT NULL UNIQUE REFERENCES prospects (id),
  campaign_id   uuid NOT NULL REFERENCES campaigns (id),
  inbox_item_id uuid REFERENCES inbox_items (id),
  meeting_start timestamptz,
  meeting_end   timestamptz,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Supresión, append-only: una baja no se deshace desde la API.
CREATE TABLE suppression_list (
  tenant_id   text NOT NULL REFERENCES tenants (id),
  email       text NOT NULL CHECK (email = lower(email)),
  source      text NOT NULL CHECK (source IN ('enlace_baja', 'respuesta', 'manual')),
  prospect_id uuid REFERENCES prospects (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, email)
);

-- Reglas del tenant; sin fila, valen DEFAULT_GUARDRAILS de @jano/domain.
CREATE TABLE guardrails (
  tenant_id                     text PRIMARY KEY REFERENCES tenants (id),
  max_sends_per_mailbox_per_day integer NOT NULL DEFAULT 50 CHECK (max_sends_per_mailbox_per_day BETWEEN 1 AND 200),
  require_verified_email        boolean NOT NULL DEFAULT true,
  whatsapp_only_after_reply     boolean NOT NULL DEFAULT true,
  stop_sequence_on_reply        boolean NOT NULL DEFAULT true,
  autopilot                     boolean NOT NULL DEFAULT false,
  updated_by                    text,
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON campaigns
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE icp_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE icp_turns FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON icp_turns
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON accounts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON contacts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON prospects
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY por_token ON prospects FOR SELECT
  USING (token = current_setting('app.token', true));

ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_steps FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON sequence_steps
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY motor_descubre ON sequence_steps FOR SELECT TO jano_motor
  USING (current_user = 'jano_motor');

ALTER TABLE prospect_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_events FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON prospect_events
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_items FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON inbox_items
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON opportunities
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE suppression_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppression_list FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON suppression_list
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE guardrails ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardrails FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON guardrails
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE ON campaigns TO jano_api;
GRANT SELECT, INSERT ON icp_turns TO jano_api;
GRANT SELECT, INSERT, UPDATE ON accounts TO jano_api;
GRANT SELECT, INSERT, UPDATE ON contacts TO jano_api;
GRANT SELECT, INSERT, UPDATE ON prospects TO jano_api;
GRANT SELECT, INSERT, UPDATE ON sequence_steps TO jano_api;
GRANT SELECT, INSERT ON prospect_events TO jano_api;
GRANT SELECT, INSERT, UPDATE ON inbox_items TO jano_api;
GRANT SELECT, INSERT, UPDATE ON opportunities TO jano_api;
GRANT SELECT, INSERT ON suppression_list TO jano_api;
GRANT SELECT, INSERT, UPDATE ON guardrails TO jano_api;

-- El motor, para descubrir qué tenants tienen trabajo: tres columnas y nada más.
GRANT SELECT (tenant_id, status, scheduled_for) ON sequence_steps TO jano_motor;
