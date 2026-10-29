# Tareas 007 · Tenants y alta B2B

Convención: `- [ ] Tnnn [P?] [USn?] descripción con ruta · verificación`. Los tests van dentro de cada fase porque la constitución (V) y SC-004 los exigen.

## Fase 1 · Base del backend
- [X] T001 Crear el paquete `@jano/backend` en `backend/` (`package.json` con scripts `build`, `type-check`, `test`, `lint`, `migrar`, `alta-tenant`, `importar-tenant`, `suspender-tenant`; `tsconfig.json` strict como `packages/domain`; `build.mjs` con esbuild a `backend/dist/api/index.mjs`, ESM, `@aws-sdk/*` externos) y añadir `backend` a `pnpm-workspace.yaml` · `pnpm install && pnpm --filter @jano/backend type-check`.
- [X] T002 [P] Puertos en `backend/src/ports/{db.ts,directorio.ts,reloj.ts}`: `Db.enTenant(tenantId, fn)` (transacción con `app.tenant_id` fijado), `Db.comoSistema(fn)` solo para scripts operativos, `Directorio` (crear invitado, deshabilitar + cerrar sesiones, habilitar, reenviar, listar por tenant) · `type-check`.
- [X] T003 [P] Helper de tests `backend/test/pg.ts`: Postgres 16 efímero en Docker (o `DATABASE_URL` en CI), aplica las migraciones, crea el rol `jano_api` y devuelve un `PgDb` que entra con ese rol · lo usan los tests de T006.

## Fase 2 · Fundacional (bloquea todo lo demás)
- [X] T004 Migración `backend/migrations/001_tenants.sql` según `data-model.md`: `tenants` (`id` text PK con `CHECK (id ~ '^tenant-[a-z0-9-]{2,48}$')`, `name` 1-120, `plan` default `'piloto'`, `status IN ('active','suspended')`), `tenant_users` (PK `(tenant_id, user_id)`, `user_id` único global, `email` en minúsculas y único global, `role IN ('owner','member')`, `status IN ('invited','active','disabled')`, `invited_by`, `created_at`, `updated_at`), `user_activity` append-only con las acciones listadas; `ENABLE` + `FORCE ROW LEVEL SECURITY` y políticas sobre `current_setting('app.tenant_id', true)`; `GRANT` a `jano_api`: `SELECT` en `tenants`, `SELECT, INSERT, UPDATE` en `tenant_users`, `SELECT, INSERT` en `user_activity` · test de migración en T006.
- [X] T005 Adaptadores de base de datos `backend/src/adapters/{data-api-db.ts,pg-db.ts}`: transacción por llamada, `select set_config('app.tenant_id', :t, true)` antes de cualquier consulta, reintento ante `DatabaseResumingException` como Fenora · tests de T006.
- [X] T006 Tests de base `backend/test/{migraciones,aislamiento}.test.ts`: migraciones idempotentes; `jano_api` sin `rolbypassrls` ni propiedad de tablas; con dos tenants inventados (`.example`), lecturas y escrituras cruzadas y consultas sin `WHERE tenant_id` devuelven 0 filas del otro tenant; sin `app.tenant_id`, 0 filas (SC-004, US4) · `pnpm --filter @jano/backend test`.
- [X] T007 [P] Tipos del dominio en `packages/domain/src/tenant.ts` (zod: `TenantRole`, `TenantUserStatus`, `CurrentTenant`, `TenantUser`, `InviteTenantUser`, con `id` `^tenant-[a-z0-9-]{2,48}$`, `name` 1-120, `email` ≤ 254) y export en `index.ts` · `pnpm --filter @jano/domain type-check`.
- [X] T008 [P] Contrato: llevar `specs/007-tenants-b2b/contracts/team.yaml` a `contracts/openapi/jano-api.yaml` (tag `team`, rutas, `userId`, `Forbidden`, esquemas) · el YAML parsea y las rutas coinciden con `contracts/team.yaml`.
- [X] T009 Adaptador HTTP y entrypoint `backend/src/adapters/http.ts` y `backend/src/entrypoints/api.ts`: lee `sub`, `custom:tenant_id` y `custom:role` de `requestContext.authorizer.jwt.claims`; antes de cada caso de uso comprueba en `tenant_users`/`tenants` que el usuario y el tenant están activos (403 si no) y pasa `invited` a `active`; errores como `Problem`; logs JSON con `tenant_id` y `request_id` · test con eventos de API Gateway v2 contra Postgres.
- [X] T010 Script `backend/scripts/migrar.ts`: aplica `migrations/*.sql` pendientes con el secreto maestro por Data API, registra en `schema_migrations`, crea o actualiza el rol `jano_api` con la contraseña de `jano/<env>/aurora-api` y falla si `rolbypassrls` es verdadero · ejecución en dev en T014.
- [X] T011 Módulo `infra/modules/backend-api`: secreto `jano/<env>/aurora-api` (`random_password`, sin especiales), Lambda `jano-<env>-api` (Node 22, 256 MB, 10 s) desde `backend/dist/api`, rol con `rds-data:*Statement`/`*Transaction` sobre el clúster, `GetSecretValue` del secreto de la API y Cognito `Admin*` sobre el pool, log group 30 d, integración y rutas de `contracts/team.yaml` con el autorizador · `terraform validate`.
- [X] T012 `infra/environments/dev`: instanciar `backend-api` con las salidas de `aurora`, `cognito` y `api_gateway` (exponer `api_id`, `authorizer_id`, `execution_arn`) · `terraform plan` solo con altas.
- [X] T013 CI y despliegue: construir el backend antes de `terraform plan` en `infra-plan.yml`, `infra-apply.yml` y `infra/scripts/deploy-dev.sh`; `infra-apply` y `deploy-dev.sh` ejecutan `migrar` tras el `apply`; job de tests del backend con servicio `postgres:16` en `.github/workflows/scripts-tests.yml` · CI en verde.
- [X] T014 Aplicar en dev y migrar · `terraform apply` y `migrar` sin errores; `schema_migrations` contiene `001`.

## Fase 3 · US1 Alta de una empresa (P1)
Prueba independiente: dar de alta una empresa inventada y que su owner vea su nombre en la app.
- [X] T020 [US1] Caso de uso `backend/src/application/tenant-actual.ts` y ruta `GET /tenant` · test: devuelve nombre, plan, estado y rol; 403 para usuario `disabled` o tenant `suspended`.
- [X] T021 [P] [US1] `backend/scripts/alta-tenant.ts --tenant --nombre --owner [--nombre-owner]`: falla sin crear nada si el email ya existe en Cognito; crea el tenant, el owner en Cognito (invitación) y en `tenant_users`, y registra `tenant_created` y `user_invited` · test con `Directorio` en memoria y Postgres.
- [X] T022 [P] [US1] `backend/scripts/importar-tenant.ts --tenant --nombre`: crea el tenant si falta y copia los usuarios de Cognito con ese `custom:tenant_id` (rol del atributo, estado `active` si CONFIRMED) registrando `user_imported`; idempotente · test.
- [X] T023 [US1] Pre-token V2: `infra/modules/cognito/lambda/pre-token/index.mjs` responde `claimsAndScopeOverrideDetails` con los claims en ID y access token, `lambda_config.pre_token_generation_config { lambda_version = "V2_0" }` en `infra/modules/cognito/main.tf` · `node --test` del trigger y `apply`.
- [X] T024 [US1] App: `getCurrentTenant` en `frontend/jano-app/src/lib/api/jano.ts`, fixture en `lib/api/fixtures` con empresa `.example` y nombre del tenant en `components/layout/sidebar.tsx` (bloque del usuario, en todas las pantallas; un 403 de `/tenant` cierra la sesión) · `pnpm type-check && pnpm build`.
- [X] T025 [US1] Dev: `importar-tenant --tenant tenant-rumbonorte --nombre "Rumbo Norte"` · `GET /v1/tenant` con el token del piloto devuelve Rumbo Norte (SC-005).

## Fase 4 · US2 Invitar (P1)
Prueba independiente: un owner invita a un email nuevo y ese email entra en el mismo tenant.
- [X] T030 [US2] Reglas en `backend/src/domain/equipo.ts` (solo owner activo gestiona; email en minúsculas) y casos de uso `listar` e `invitar` en `backend/src/application/equipo.ts` (Cognito primero, deshacer si falla la base de datos; 409 si el email existe sin decir el tenant; `user_invited`) · tests unitarios y contra Postgres.
- [X] T031 [US2] `backend/src/adapters/cognito-directorio.ts` (`AdminCreateUser` con `custom:tenant_id`, `custom:role=member`, `email_verified=true`; `RESEND`; `AdminDisableUser` + `AdminUserGlobalSignOut`; `AdminEnableUser`; `ListUsers` filtrado) · type-check y prueba en dev en T034.
- [X] T032 [US2] Rutas `GET /tenant/users` y `POST /tenant/users` en `backend/src/entrypoints/api.ts` · test de 403 para member y 409 para email existente.
- [X] T033 [US2] App: pantalla `frontend/jano-app/src/app/(dashboard)/equipo/page.tsx` con lista (rol, estado) y formulario de invitación, enlace en `components/layout/sidebar.tsx` solo para `role=owner`, cliente en `lib/api/jano.ts` y fixtures · `pnpm build`; en mock se ve la lista.
- [ ] T034 [US2] Dev: invitar a una cuenta de prueba de Andrés y entrar · el invitado aparece `invited` y luego `active` (SC-002).

## Fase 5 · US3 Desactivar y reactivar (P1)
Prueba independiente: un member desactivado con sesión abierta recibe 403 en su siguiente petición.
- [X] T040 [US3] Casos de uso `desactivar`, `reactivar` y `reenviar` en `backend/src/application/equipo.ts` (no a uno mismo ni a owners: 409; siempre queda un owner activo; reenviar solo a `invited`; actividad registrada) y rutas `/tenant/users/{userId}/disable|enable|resend-invitation` · tests.
- [X] T041 [US3] App: acciones Desactivar, Reactivar y Reenviar en `/equipo` · `pnpm build`.
- [ ] T042 [US3] Dev: desactivar la cuenta de T034 con sesión abierta · su siguiente petición devuelve 403 y no puede entrar con contraseña ni con Google (SC-003); reactivada, entra.

## Fase 6 · US4 Aislamiento (P1)
- [X] T050 [US4] Ampliar `backend/test/aislamiento.test.ts` a los casos de uso de equipo (un owner de A no lista, invita ni desactiva en B aunque pase un `userId` de B: 404) · `pnpm --filter @jano/backend test`.

## Fase 7 · US5 Suspensión (P2)
- [X] T060 [US5] `backend/scripts/suspender-tenant.ts --tenant [--reactivar]`: cambia `status`, deshabilita o habilita en Cognito a todos sus usuarios activos y registra la acción · test (`operaciones.test.ts`, `api.test.ts`); la prueba en dev queda para el primer tenant real, para no enviar correos de alta a direcciones inventadas.

## Fase 8 · Cierre
- [X] T070 [P] `docs/guias/despliegue-dev.md`: migraciones, alta, importación y suspensión de tenants; `AGENTS.md` §1 mapa con `backend/` y el módulo `backend-api` (con OK de Andrés) · revisión en el PR.
- [X] T071 [P] Spec 003: anotar que sus FR-001, FR-002 y FR-003 parten de lo hecho en 007 · revisión en el PR.
- [X] T072 Evidencia en `specs/007-tenants-b2b/research.md` (comandos y salidas) y estado de los SC en `spec.md` · `pnpm type-check && pnpm build && pnpm test` y `terraform fmt -check` en verde.

## Dependencias
Fase 1 → Fase 2 → US1 → US2 → US3; US4 (T050) tras US2/US3; US5 tras US1. Dentro de cada fase, las tareas [P] van en paralelo.

## Estrategia
MVP: Fases 1-3 (tenant como dato, pre-token V2, nombre en la app, usuarios actuales importados). Después US2 y US3 juntas (equipo), US4 cierra la batería y US5 queda para antes del primer piloto.
