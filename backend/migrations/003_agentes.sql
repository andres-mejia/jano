-- 003 · Agentes de la prueba de concepto (spec 008 fase B: FR-013b, FR-016).
--
-- Mismo aislamiento que 001 y 002: tenant_id, ENABLE + FORCE ROW LEVEL SECURITY y
-- la política sobre `app.tenant_id`. jano_api no borra nada.
--
--   - candidate_cache: candidatas de OpenStreetMap por región durante 24 h. Son datos
--     públicos, pero la caché va por tenant para no tener una tabla sin tenant_id
--     (AGENTS.md §4) y para que todo se lea en la misma transacción con RLS. El coste
--     es una consulta a Overpass por tenant, región y día.
--   - ai_usage: llamadas al modelo por tenant y día (Europe/Madrid), con tokens y coste
--     estimado. El tope diario se comprueba aquí antes de cada llamada.

CREATE TABLE candidate_cache (
  tenant_id   text NOT NULL REFERENCES tenants (id),
  cache_key   text NOT NULL CHECK (char_length(cache_key) BETWEEN 1 AND 200),
  companies   jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, cache_key)
);

CREATE TABLE ai_usage (
  tenant_id     text NOT NULL REFERENCES tenants (id),
  day           date NOT NULL,
  calls         integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  input_tokens  bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd      numeric(12, 6) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  PRIMARY KEY (tenant_id, day)
);

ALTER TABLE candidate_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON candidate_cache
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY aislamiento ON ai_usage
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE ON candidate_cache TO jano_api;
GRANT SELECT, INSERT, UPDATE ON ai_usage TO jano_api;
