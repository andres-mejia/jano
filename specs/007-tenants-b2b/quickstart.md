# Quickstart 007 · Cómo se valida

Requisitos: Node 22, pnpm, Docker (tests) y el perfil SSO `fintrack-dev` (dev).

## Local
```bash
pnpm install
pnpm --filter @jano/backend test        # dominio, casos de uso, migraciones y RLS contra Postgres 16 en Docker
pnpm type-check && pnpm build
```
Esperado: la batería de aislamiento (`backend/test/aislamiento.test.ts`) pasa con dos tenants inventados (`.example`) y cero filas cruzadas, también con consultas sin `WHERE tenant_id`.

## Dev
```bash
infra/scripts/deploy-dev.sh             # construye el backend, plan, apply y migraciones
pnpm --filter @jano/backend importar-tenant --tenant tenant-rumbonorte --nombre "Rumbo Norte"
pnpm --filter @jano/backend alta-tenant --tenant tenant-faro --nombre "Faro Ingeniería" --owner <email de prueba>
```
Comprobaciones:
1. `GET /v1/tenant` con el token del piloto devuelve Rumbo Norte y `role: owner` (SC-005).
2. En https://jano-app.tekhos.com el topbar muestra «Rumbo Norte»; `/equipo` lista a los usuarios importados.
3. Invitar desde `/equipo` a una cuenta de prueba: llega el correo y la cuenta entra como member (SC-002).
4. Desactivarla con su sesión abierta: su siguiente petición devuelve 403 (SC-003); reactivarla y vuelve a entrar.
5. El access token decodificado lleva `custom:tenant_id` y `custom:role` (FR-007).
