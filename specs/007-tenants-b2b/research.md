# Research 007 · Tenants y alta B2B

## 1. Dónde vive el backend
- **Decisión**: paquete `backend/` del workspace, empaquetado con esbuild a un único `.mjs`, desplegado como Lambda por Terraform (módulo `backend-api`).
- **Por qué**: es la forma de la spec 003 (FR-001) y del resto de Lambdas del repo; esbuild evita subir `node_modules` y el SDK v3 ya viene en el runtime de Node 22.
- **Alternativas**: Lambdas sueltas en `.mjs` como el waitlist (sin TypeScript ni dominio compartido, choca con II); contenedor en ECR (fuera de ADR-001 §3).

## 2. Aislamiento por fila con Data API
- **Decisión**: RLS con `FORCE`, política sobre `current_setting('app.tenant_id', true)` fijado con `set_config(..., true)` dentro de una transacción por petición; la API usa el rol `jano_api` (no propietario, sin `BYPASSRLS`, solo DML).
- **Por qué**: Data API no mantiene sesión entre llamadas fuera de una transacción, así que la variable solo es fiable con `is_local = true` dentro de `BeginTransaction`/`CommitTransaction`. Sin la variable, `current_setting(..., true)` es `NULL` y la política no devuelve filas: falla cerrado (US4.3). Un rol propietario o con `BYPASSRLS` se saltaría las políticas.
- **Alternativas**: schema por tenant como Fenora (descartado por Andrés); filtro solo en código (no cumple FR-008); `SET ROLE` por petición con el usuario maestro (la API seguiría teniendo credenciales de propietario).

## 3. Pre-token V2
- **Decisión**: `pre_token_generation_config` con `V2_0`; respuesta `claimsAndScopeOverrideDetails.idTokenGeneration` y `accessTokenGeneration` con `custom:tenant_id` y `custom:role`. La app sigue mandando el ID token; el access token queda listo para la 003.
- **Por qué**: igual que Fenora; V1 solo toca el ID token. V2 requiere tier ESSENTIALS, que el pool ya tiene.

## 4. Fuente de verdad de usuarios
- **Decisión**: Cognito guarda identidad, contraseña y enlace con Google; `tenant_users` guarda pertenencia, rol, estado (`invited`, `active`, `disabled`), quién invitó y cuándo. La API escribe en los dos en el mismo caso de uso (Cognito primero; si la base de datos falla, se deshace en Cognito). `invited` pasa a `active` en la primera petición autenticada del usuario.
- **Por qué**: la pantalla Equipo y la auditoría necesitan consultas por tenant que Cognito no ofrece; el estado de acceso se impone en Cognito (no entra) y en la API (no opera).

## 5. Usuarios existentes
- **Decisión**: `importar-tenant.ts --tenant tenant-rumbonorte --nombre "Rumbo Norte"` crea el tenant si falta y copia a `tenant_users` los usuarios de Cognito con ese `custom:tenant_id`. Nada de datos reales en migraciones ni en el repo.

## 6. Tests contra Postgres
- **Decisión**: Docker `postgres:16` efímero por ejecución de tests (`backend/test/pg.ts`), las mismas migraciones y el mismo rol `jano_api`; en CI corre igual dentro de `pnpm test` (frontend-ci), que tiene Docker en `ubuntu-latest`.
- **Alternativas**: PGlite (corre como superusuario y RLS no aplica sin más juego de roles); mocks de la base de datos (no prueban RLS).

## Evidencia (2026-10-29)

```
pnpm --filter @jano/backend test                 -> tests 29, pass 29, fail 0 (Postgres 16 en Docker, rol jano_api)
  aislamiento.test.ts                            -> sin filtro, filtrando por el otro tenant, update sin where, insert en otro tenant
                                                    (row-level security), sin app.tenant_id: 0 filas; delete/update de actividad: permission denied
  api.test.ts                                    -> GET /tenant, equipo, invitar (409 sin revelar tenant, deshacer en Cognito), desactivar
                                                    con sesión abierta -> 403, reactivar, reenviar, owner de A sobre usuarios de B -> 404, tenant suspendido -> 403
  operaciones.test.ts                            -> alta, alta con email existente sin rastro, importar idempotente, suspender/reactivar
node --test infra/modules/cognito/lambda/pre-token/index.test.mjs -> pass 4 (claims en ID y access token)
pnpm type-check && pnpm --filter @jano/app build && pnpm --filter @jano/app test -> verde; ruta /equipo
terraform apply                                  -> Resources: 13 added, 2 changed, 0 destroyed (backend-api; pre-token V1_0 -> V2_0)
pnpm --filter @jano/backend migrar               -> migraciones aplicadas: 001_tenants.sql; secreto de jano_api generado;
                                                    rol jano_api listo: sin BYPASSRLS y sin tablas propias
pnpm --filter @jano/backend importar-tenant --tenant tenant-rumbonorte --nombre "Rumbo Norte"
                                                 -> importados 2 usuarios; segunda vez: ya estaba al día
aws lambda invoke jano-dev-api (GET /v1/tenant, sub del piloto)
                                                 -> 200 {"id":"tenant-rumbonorte","name":"Rumbo Norte","plan":"piloto","status":"active","role":"owner"}
aws lambda invoke jano-dev-api (GET /v1/tenant/users)
                                                 -> 200, 2 usuarios owner/active
```

Pendiente (Andrés, navegador): T034 invitar a una cuenta de prueba y entrar; T042 desactivarla con la sesión abierta.
