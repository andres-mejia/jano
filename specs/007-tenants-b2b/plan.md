# Plan 007 · Tenants y alta B2B

**Spec**: `specs/007-tenants-b2b/spec.md` · **Rama**: `feat/tenants-b2b`

## Resumen
Primer trozo del backend de la spec 003: paquete `backend/` en TypeScript (Node 22, hexagonal) con migraciones SQL numeradas, tablas `tenants`, `tenant_users` y `user_activity` con aislamiento por fila (RLS) y un rol de base de datos propio de la API sin privilegios de propietario. La API sirve los endpoints de tenant y equipo con una Lambda `jano-dev-api` detrás del autorizador JWT existente; Cognito sigue siendo la identidad y la base de datos guarda pertenencia, rol y estado. Comandos operativos para dar de alta, suspender e importar tenants. El trigger pre-token pasa a V2 para llevar tenant y rol también en el access token. La app muestra el nombre del tenant y una pantalla Equipo para el owner.

## Contexto técnico
- **Lenguaje y build**: TypeScript strict, Node 22. `backend/` es paquete del workspace (`@jano/backend`); `esbuild` empaqueta `src/entrypoints/api.ts` en `backend/dist/api/index.mjs` (ESM, `@aws-sdk/*` externos porque los trae el runtime). Terraform comprime `backend/dist/api`; por eso `infra-plan`, `infra-apply` y `deploy-dev.sh` construyen el backend antes de `terraform plan`.
- **Capas** (research §1): `domain` (reglas de tenant y equipo, puras), `application` (casos de uso), `ports` (`Db`, `Directorio` de identidad, `Reloj`), `adapters` (`DataApiDb`, `PgDb` para tests, `CognitoDirectorio`, `http` de API Gateway v2).
- **Datos**: Aurora PostgreSQL 16 por Data API. Migraciones en `backend/migrations/NNN_*.sql`, tabla `schema_migrations`; las aplica `backend/scripts/migrar.ts` con el secreto maestro, nunca una Lambda al arrancar (spec 003 FR-003). Lo ejecutan `deploy-dev.sh` y el job `infra-apply` tras el `apply`.
- **Aislamiento** (research §2): cada tabla de negocio con `tenant_id text not null`, `ENABLE` + `FORCE ROW LEVEL SECURITY` y política `tenant_id = current_setting('app.tenant_id', true)`. Cada petición abre transacción, fija `set_config('app.tenant_id', $1, true)` y solo entonces consulta. La API entra con el rol `jano_api` (DML sin `BYPASSRLS`, no propietario), cuyo secreto `jano/<env>/aurora-api` crea Terraform con `random_password` y cuya contraseña fija `migrar.ts`.
- **Identidad**: invitar = `AdminCreateUser` con `custom:tenant_id` y `custom:role=member` (correo de Cognito con contraseña temporal); desactivar = `AdminDisableUser` + `AdminUserGlobalSignOut`; reactivar = `AdminEnableUser`; reenviar = `AdminCreateUser` con `MessageAction=RESEND`. La API comprueba en cada petición que el usuario está activo y el tenant activo (FR-006): la sesión de un desactivado se corta en su siguiente petición aunque su token siga vigente.
- **Pre-token V2** (research §3): `lambda_config.pre_token_generation_config { lambda_version = "V2_0" }`; la respuesta usa `claimsAndScopeOverrideDetails` con los mismos claims en ID y access token. Sin acceso a Aurora: entrar no depende de que la base de datos despierte.
- **Contrato**: `contracts/openapi/jano-api.yaml` gana el tag `team` y las rutas de `contracts/team.yaml` de esta feature; los tipos en `packages/domain/src/tenant.ts` (zod) son la fuente.
- **App**: topbar con el nombre del tenant (`GET /tenant`); `/equipo` visible solo con `custom:role=owner`; fixtures de modo mock con empresas `.example`.
- **Tests**: unitarios del dominio y de los casos de uso con un `Directorio` en memoria (puerto de infraestructura, no dominio); integración de migraciones, RLS y repositorios contra Postgres 16 en Docker (`backend/test/pg.ts` levanta un contenedor efímero); batería de aislamiento con dos tenants y consultas sin filtro (SC-004).
- **Rendimiento y coste**: Lambda 256 MB; Aurora sigue en pausa sin tráfico (primera petición tras la pausa: 15-30 s, la app reintenta).

## Puerta de constitución
| Principio | Cumple | Nota |
|---|---|---|
| I · IA decide, motor ejecuta | n/a | Sin agentes ni envíos a prospects |
| II · Contract-first, dominio sin infra | Sí | Contrato y `@jano/domain` primero; el dominio del backend no importa SDK ni SQL |
| III · Misma plataforma que Fenora | Sí | Data API, Lambda sin VPC, triggers como Fenora (pre-token V2). Diferencia justificada: tenant = empresa y aislamiento por fila (decisión de Andrés 2026-10-29) |
| IV · Cumplimiento | Sí | Invitaciones solo a usuarios de la app; fixtures y tests con `.example`; los datos reales de los usuarios existentes se importan de Cognito, no se escriben en el repo |
| V · Verificación con evidencia | Sí | Tests reales contra Postgres, plan revisado, prueba en navegador |

Re-evaluación tras el diseño: sin cambios.

## Estructura
```
backend/
  package.json, tsconfig.json, build.mjs
  migrations/001_tenants.sql
  src/domain/       equipo.ts (reglas: quién puede qué, último owner)
  src/application/  tenant-actual.ts, equipo.ts (invitar, desactivar, reactivar, reenviar, listar)
  src/ports/        db.ts, directorio.ts, reloj.ts
  src/adapters/     data-api-db.ts, pg-db.ts, cognito-directorio.ts, http.ts
  src/entrypoints/  api.ts
  scripts/          migrar.ts, alta-tenant.ts, importar-tenant.ts, suspender-tenant.ts
  test/             pg.ts, *.test.ts
infra/modules/backend-api/   Lambda jano-<env>-api, rol, secreto aurora-api, rutas del contrato
```
El módulo `api-gateway` deja de crear la Lambda placeholder para las rutas que ya sirve el backend; las que no (dashboard) siguen en 501 hasta la 003.

## Riesgos
- **Data API y transacciones**: cada petición son 3-5 llamadas (begin, set_config, consultas, commit). Aceptable con el volumen del MVP; si molesta, se agrupan en una función SQL.
- **Rol `jano_api` y RLS**: si el rol tuviera `BYPASSRLS` o fuera propietario, el aislamiento sería papel mojado; la batería de aislamiento corre con ese mismo rol y `migrar.ts` comprueba `rolbypassrls = false`.
- **Pre-token V2** exige tier ESSENTIALS o superior: el pool ya lo es.
- **Correo de invitación de Cognito** (`COGNITO_DEFAULT`): límite de 50 al día y plantilla genérica; suficiente para pilotos.
