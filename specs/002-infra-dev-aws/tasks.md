# Tareas 002 · Infraestructura dev en AWS

Convención: `[Tn] [P?] descripción · verificación`. `[P]` = paralelizable. Cada fase termina con `terraform fmt -recursive`, `terraform validate`, commit en `infra/dev-base` y parada para el OK antes de `apply`.

## Fase 0 · Inventario
- [ ] T001 Leer `fintrack/infra/modules/{aurora,cognito,landing,cdn,waitlist,email,assets,github-oidc,dns}/main.tf` y anotar en `specs/002-infra-dev-aws/research.md` qué se replica y qué se recorta · fichero creado con una tabla módulo → decisión.
- [ ] T002 Confirmar con Andrés las tres dudas de la spec (dominio, VPC, remitente SES) y cerrarlas en `research.md` · sin `[NEEDS CLARIFICATION]` en spec.md.
- [ ] T003 `aws sts get-caller-identity` y `aws s3 ls s3://fenora-terraform-state-$ACCOUNT_ID/` · cuenta correcta y bucket accesible.

## Fase 1 · Datos y almacenamiento
- [ ] T010 [P] `infra/modules/vpc`: VPC `jano-dev`, 2 subnets privadas, sin NAT ni IGW · `validate` OK.
- [ ] T011 [P] `infra/modules/assets`: bucket `jano-dev-assets-<account>`, SSE-S3, versionado, bloqueo público, lifecycle de versiones a 90 d · `validate` OK.
- [ ] T012 `infra/modules/aurora`: cluster Serverless v2 con Data API, min ACU 0, auto-pause 300 s, SG sin ingress · `validate` OK.
- [ ] T013 `infra/environments/dev/main.tf`: componer vpc + assets + aurora; `infra/scripts/deploy-dev.sh` con `init -backend-config` · `plan` muestra solo creaciones.
- [ ] T014 `apply` con OK · `aws rds-data execute-statement --sql "select 1"` responde (tras el resume).
- [ ] T015 Medir coste en reposo 24 h después en Cost Explorer y anotarlo en `research.md` · cifra anotada.

## Fase 2 · Identidad
- [ ] T020 `infra/modules/cognito`: pool, cliente público (USER_AUTH, sin secret), dominio Hosted UI, atributos custom · `validate` OK.
- [ ] T021 `infra/modules/cognito/lambda/pre-token/index.mjs` + test con `node --test` · claims `custom:tenant_id` y `custom:role` presentes en el evento de salida.
- [ ] T022 `apply`; crear usuario piloto con `aws cognito-idp admin-create-user` y atributos custom · ID token decodificado lleva ambos claims.

## Fase 3 · Correo y acceso anticipado
- [ ] T030 `infra/modules/email`: identidad SES del dominio, DKIM, configuration set, registros DNS si hay zona · `validate` OK.
- [ ] T031 `infra/modules/waitlist`: tabla, rol, Lambda Node 22, HTTP API con CORS y throttling · `validate` OK.
- [ ] T032 `lambda/handler/index.mjs` con validación de email, honeypot, idempotencia (409), rate limit por IP con TTL, SES; `index.test.mjs` con `node --test` · tests verdes.
- [ ] T033 `apply`; `curl -X POST $WAITLIST_URL -d '{"email":"prueba@example.com"}'` · 201, item en DynamoDB, correo recibido; segundo POST → 409.

## Fase 4 · API vacía con autorizador
- [ ] T040 `infra/modules/api-gateway`: HTTP API `jano-dev`, autorizador JWT (issuer del pool, audience del cliente), CORS para app y localhost, stage `$default` con throttling · `validate` OK.
- [ ] T041 Ruta `GET /v1/health` sin autorizador con integración mock y `GET /v1/dashboard/summary` con autorizador apuntando a una Lambda placeholder que devuelve 501 · `curl` sin token → 401; con token → 501.

## Fase 5 · Hosting
- [ ] T050 `infra/modules/landing`: Amplify WEB, build_spec igual al `amplify.yml`, variables `PUBLIC_*`, `AMPLIFY_MONOREPO_APP_ROOT=frontend/jano-web`, dominio condicional · `validate` OK.
- [ ] T051 `infra/modules/app-hosting`: Amplify WEB_COMPUTE, `NEXT_PUBLIC_*` desde outputs, `AMPLIFY_MONOREPO_APP_ROOT=frontend/jano-app` · `validate` OK.
- [ ] T052 `apply`; autorizar la CodeStar Connection en consola; `aws amplify start-job --job-type RELEASE` en las dos apps · ambas URL responden 200 y la app muestra `/login` con Cognito.
- [ ] T053 Push de prueba a `main` (un cambio de texto en la landing) · Amplify publica solo; anotar el tiempo.

## Fase 6 · CI con OIDC
- [ ] T060 `infra/modules/github-oidc`: proveedor (si no existe ya en la cuenta: usar `data` sobre el de Fenora), rol `jano-dev-github-actions` acotado · `validate` OK.
- [ ] T061 `.github/workflows/infra-plan.yml` (PR, comenta el plan) e `infra-apply.yml` (push a `main`, guarda del plan: aborta si hay `destroy`) · un PR de prueba comenta el plan.
- [ ] T062 `docs/guias/despliegue-dev.md` con bootstrap, variables, comandos y qué se hace a mano (zona DNS, conexión Amplify, usuario piloto) · guía revisada por Andrés.

## Cierre
- [ ] T070 `terraform plan` sin cambios; `specs/002-infra-dev-aws/spec.md` con los SC marcados y la evidencia (comando y salida) en el cuerpo del PR.
