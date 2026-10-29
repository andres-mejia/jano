-- 001 · Tenants y equipo (spec 007, data-model.md).
--
-- Aislamiento por fila (AGENTS.md §4): cada tabla lleva tenant_id y una política
-- sobre `app.tenant_id`, que la API fija con set_config(..., true) al abrir la
-- transacción de cada petición. Sin esa variable, current_setting(..., true) es NULL
-- y no se ve ninguna fila. FORCE hace que la política alcance también al propietario.
-- La API entra con jano_api: sin BYPASSRLS, sin propiedad y solo con DML.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jano_api') THEN
    CREATE ROLE jano_api LOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO jano_api;

CREATE TABLE tenants (
  id         text PRIMARY KEY CHECK (id ~ '^tenant-[a-z0-9-]{2,48}$'),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  plan       text NOT NULL DEFAULT 'piloto',
  status     text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenant_users (
  tenant_id  text NOT NULL REFERENCES tenants (id),
  user_id    text NOT NULL UNIQUE,
  email      text NOT NULL UNIQUE CHECK (email = lower(email) AND char_length(email) <= 254),
  name       text CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 120),
  role       text NOT NULL CHECK (role IN ('owner', 'member')),
  status     text NOT NULL CHECK (status IN ('invited', 'active', 'disabled')),
  invited_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

-- Append-only: la API solo inserta y lee.
CREATE TABLE user_activity (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants (id),
  actor     text NOT NULL,
  action    text NOT NULL CHECK (action IN (
              'tenant_created', 'user_invited', 'user_disabled', 'user_enabled',
              'invitation_resent', 'tenant_suspended', 'tenant_reactivated', 'user_imported')),
  target    text,
  at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_activity_tenant_at ON user_activity (tenant_id, at DESC);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON tenants
  USING (id = current_setting('app.tenant_id', true))
  WITH CHECK (id = current_setting('app.tenant_id', true));

ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON tenant_users
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE user_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_activity FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON user_activity
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

GRANT SELECT ON tenants TO jano_api;
GRANT SELECT, INSERT, UPDATE ON tenant_users TO jano_api;
GRANT SELECT, INSERT ON user_activity TO jano_api;
