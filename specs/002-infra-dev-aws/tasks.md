# Tareas 002 · Infraestructura dev en AWS

Convención: `[Tn] [P?] descripción · verificación`. `[P]` = paralelizable. Cada fase termina con `terraform fmt -recursive`, `terraform validate`, commit en `infra/dev-base` y parada para el OK antes de `apply`.

## Fase 0 · Inventario
- [X] T001 Leer `fintrack/infra/modules/{aurora,cognito,landing,cdn,waitlist,email,assets,github-oidc,dns}/main.tf` y anotar en `specs/002-infra-dev-aws/research.md` qué se replica y qué se recorta · fichero creado con una tabla módulo → decisión.
- [X] T002 Confirmar en `~/py/cardea` cómo quedaron el rol de apply (política de arranque y Deny de guarda), el rol de plan, la regla SES en el rule set de `tekhos.com` y la asociación de dominio en Amplify, y anotar en `research.md` qué se replica igual · tabla en research.md.
- [X] T003 `aws sts get-caller-identity`, `aws s3 ls s3://fenora-terraform-state-$ACCOUNT_ID/`, `aws route53 list-hosted-zones-by-name --dns-name tekhos.com` y `aws ses describe-active-receipt-rule-set --region eu-west-1` · cuenta, bucket, zona y rule set activo identificados.

## Fase 1 · Datos y almacenamiento
- [ ] T010 [P] `infra/modules/vpc`: VPC `jano-dev`, 2 subnets privadas, sin NAT ni IGW · `validate` OK.
- [ ] T011 [P] `infra/modules/assets`: bucket `jano-dev-assets-<account>`, SSE-S3, versionado, bloqueo público, lifecycle de versiones a 90 d · `validate` OK.
- [ ] T012 `infra/modules/aurora`: cluster Serverless v2 con Data API, min ACU 0, auto-pause 300 s, SG sin ingress · `validate` OK.
- [ ] T013 `infra/environments/dev/main.tf`: componer vpc + assets + aurora; `infra/scripts/deploy-dev.sh` con `init -backend-config` · `plan` muestra solo creaciones.
- [ ] T014 `apply` con OK · `aws rds-data execute-statement --sql "select 1"` responde (tras el resume).
- [ ] T015 Medir coste en reposo 24 h después en Cost Explorer y anotarlo en `research.md` · cifra anotada.
- [ ] T016 Presupuesto AWS Budgets `jano-dev-monthly` de 50 USD al mes (la moneda de Budgets en la cuenta), tras activar la etiqueta `Project` como etiqueta de costes filtrado por `Project=jano`, aviso por email a `ses_notify_address` al 80 % y al 100 % (FR-009) · `aws budgets describe-budget` lo devuelve tras el `apply`.

## Fase 2 · Identidad
- [ ] T020 `infra/modules/cognito`: pool, cliente público (USER_AUTH, sin secret), dominio Hosted UI, atributos custom, misma política de contraseña que Cardea; log group del trigger con retención de 30 d · `validate` OK.
- [ ] T021 `infra/modules/cognito/lambda/pre-token/index.mjs` + test con `node --test` · claims `custom:tenant_id` y `custom:role` presentes en el evento de salida.
- [ ] T022 `apply`; crear usuario piloto con `aws cognito-idp admin-create-user` y atributos custom · ID token decodificado lleva ambos claims.

## Fase 3 · Correo y acceso anticipado
- [ ] T030 `infra/modules/email`: configuration set `jano-dev`, SNS y alarmas de reputación como Cardea; sin regla de recepción (`research.md` T002) · `validate` OK.
- [ ] T031 `infra/modules/waitlist`: tabla, rol, Lambda Node 22 con log group de retención 30 d, HTTP API con CORS (solo `jano.tekhos.com`, `jano-app.tekhos.com` y localhost) y throttling · `validate` OK.
- [ ] T032 `lambda/handler/index.mjs` con validación de email, honeypot, idempotencia (409), rate limit por IP con TTL, SES; `index.test.mjs` con `node --test` · tests verdes.
- [ ] T033 `apply`; `curl -X POST $WAITLIST_URL -d '{"email":"prueba@example.com"}'` · 201, item en DynamoDB, correo recibido; segundo POST → 409.

## Fase 4 · API vacía con autorizador
- [ ] T040 `infra/modules/api-gateway`: HTTP API `jano-dev`, autorizador JWT (issuer del pool, audience del cliente), CORS para app y localhost, stage `$default` con throttling · `validate` OK.
- [ ] T041 Ruta `GET /v1/dashboard/summary` (la del contrato) con autorizador apuntando a una Lambda placeholder que devuelve 501, log group con retención de 30 d · `curl` sin token → 401; con token → 501.

## Fase 5 · Hosting
- [ ] T050 `infra/modules/landing`: Amplify WEB, build_spec igual al `amplify.yml`, variables `PUBLIC_*`, `AMPLIFY_MONOREPO_APP_ROOT=frontend/jano-web`, dominio `jano.tekhos.com` sobre la zona de `tekhos.com`, auto-build solo en `main` y sin previews de PR (US1.3) · `validate` OK.
- [ ] T051 `infra/modules/app-hosting`: Amplify WEB_COMPUTE, `NEXT_PUBLIC_*` desde outputs, `AMPLIFY_MONOREPO_APP_ROOT=frontend/jano-app`, dominio `jano-app.tekhos.com`, auto-build solo en `main` y sin previews de PR · `validate` OK.
- [ ] T052 `apply`; autorizar la CodeStar Connection en consola; `aws amplify start-job --job-type RELEASE` en las dos apps · ambas URL responden 200 y la app muestra `/login` con Cognito.
- [ ] T053 Push de prueba a `main` (un cambio de texto en la landing) · Amplify publica solo; anotar el tiempo.

## Fase 6 · CI con OIDC
- [ ] T060 `infra/modules/github-oidc`: `data` del proveedor OIDC existente, rol de apply `jano-dev-github-actions` (main) y rol de plan `jano-dev-github-actions-plan` (pull_request); la política de arranque del rol de apply se pega por CLI con el mismo comando que Cardea y se documenta · `validate` OK.
- [ ] T061 `.github/workflows/infra-plan.yml` (PR, comenta el plan) e `infra-apply.yml` (push a `main`, guarda del plan: aborta si hay `destroy`) · un PR de prueba comenta el plan.
- [ ] T062 `docs/guias/despliegue-dev.md` con bootstrap, variables, comandos y qué se hace a mano (zona DNS, conexión Amplify, usuario piloto) · guía revisada por Andrés.

## Cierre
- [ ] T070 `terraform plan` sin cambios; `specs/002-infra-dev-aws/spec.md` con los SC marcados y la evidencia (comando y salida) en el cuerpo del PR.
