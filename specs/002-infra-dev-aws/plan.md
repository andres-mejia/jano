# Plan 002 · Infraestructura dev en AWS

**Spec**: `specs/002-infra-dev-aws/spec.md` · **Rama**: `infra/dev-base`

## Resumen
Terraform plano en `infra/environments/dev` (sin Terragrunt), módulos propios en `infra/modules/`, estado compartido con Fenora. Se copia la **forma** de `fintrack/infra/modules/{cognito,landing,cdn,waitlist,email,aurora,assets,github-oidc,dns}` y se recorta lo que Jano no usa (Google/Apple IdP, passkeys, RDS Proxy, VPC Lambda, warmers, WAF).

## Contexto técnico
- Terraform ≥ 1.9, provider AWS ~> 6.1, archive ~> 2.0. Región `eu-west-1`; alias `us-east-1` para ACM de Amplify/CloudFront.
- Lambda waitlist en Node 22 (`index.mjs`, sin bundler; SDK v3 ya en el runtime).
- Amplify: landing `WEB` (Astro `dist/`), app `WEB_COMPUTE` (Next `.next/`); conexión GitHub por CodeStar Connection autorizada una vez en consola, igual que en Fenora (`lifecycle.ignore_changes` en `repository`/`access_token`).
- Cognito: USER_AUTH, email como username, MFA `OPTIONAL` (TOTP), atributos custom `tenant_id` y `role`, trigger `pre_token_generation` en Node 22 que copia ambos a los claims; Hosted UI con prefijo `jano-dev` (sin dominio propio).
- Aurora PostgreSQL Serverless v2 16.x, `min_capacity = 0`, `seconds_until_auto_pause = 300`, `enable_http_endpoint = true`, `manage_master_user_password = true`, `storage_encrypted = true`, subnets privadas, sin acceso público.

## Puerta de constitución
| Principio | Cumple | Nota |
|---|---|---|
| I · IA decide, motor ejecuta | n/a | Sin lógica de agentes en esta feature |
| II · Contract-first | Sí | La API Gateway solo publica rutas del contrato (`GET /v1/dashboard/summary` como placeholder con autorizador); ninguna ruta fuera de `contracts/openapi/jano-api.yaml` |
| III · Misma plataforma que Fenora | Sí | Mismo estado, mismos patrones de módulo, misma cuenta; sin Quarkus. La «VPC privada» que excluye III es la de Lambda con NAT (ADR-001 §3); la VPC mínima de la decisión 2 solo alberga el subnet group que exige Aurora y ninguna Lambda entra en ella |
| IV · Cumplimiento | Sí | Sin datos reales; SES solo confirma altas; retención de logs 30 d |
| V · Verificación con evidencia | Sí | `fmt`, `validate`, `plan` idempotente y los SC medidos con comandos |

## Decisiones
1. **Estado compartido** (FR-001): `-backend-config=bucket=fenora-terraform-state-$ACCOUNT_ID`, clave propia. Justificación: cero bootstrap y un solo lugar donde mirar.
2. **VPC**: crear `jano-dev` mínima (2 AZ, solo subnets privadas, sin NAT, sin IGW) para Aurora. Ninguna Lambda entra en la VPC; Data API no la necesita. Si Andrés prefiere reutilizar la de Fenora, cambia solo `module.aurora.subnet_ids`.
3. **OIDC** (como Cardea): rol de apply `jano-dev-github-actions` (trust `repo:andres-mejia/jano:ref:refs/heads/main`) con la política de arranque `Allow *` con caducidad y los `Deny` de guarda del patrón Fenora, pegada por CLI una vez; rol de plan `jano-dev-github-actions-plan` (trust `repo:andres-mejia/jano:pull_request`) con `ReadOnlyAccess`, `s3:GetObject` del estado y `dynamodb:PutItem/DeleteItem/GetItem` del lock.
4. **Dominio** (como Cardea): `jano.tekhos.com` y `jano-app.tekhos.com` sobre la zona existente de `tekhos.com`; `aws_amplify_domain_association` por app con un solo `sub_domain` de prefijo vacío sobre el FQDN; registros de validación en la zona vía `data.aws_route53_zone`.
5. **SES** (como Cardea): regla `jano-dev-inbound` para `jano@tekhos.com` en el rule set activo de `tekhos.com` (`data` sobre el rule set; `aws_ses_receipt_rule` propia), misma acción de redirección que Cardea; remitente `jano@tekhos.com`.

## Estructura
```
infra/environments/dev/{versions,backend,provider,variables,main,outputs}.tf
infra/modules/vpc/main.tf
infra/modules/dns/main.tf
infra/modules/cognito/{main.tf,lambda/pre-token/index.mjs}
infra/modules/landing/main.tf
infra/modules/app-hosting/main.tf
infra/modules/email/main.tf
infra/modules/waitlist/{main.tf,variables.tf,lambda/handler/index.mjs,lambda/handler/index.test.mjs}
infra/modules/aurora/main.tf
infra/modules/assets/main.tf
infra/modules/api-gateway/main.tf
infra/modules/github-oidc/main.tf
infra/scripts/deploy-dev.sh          # init con -backend-config + plan + apply con confirmación
.github/workflows/{infra-plan,infra-apply}.yml
docs/guias/despliegue-dev.md
```

## Outputs que consumen 001 y 003
`cognito_user_pool_id`, `cognito_client_id`, `cognito_domain`, `api_base_url`, `waitlist_endpoint_url`, `aurora_cluster_arn`, `aurora_secret_arn`, `assets_bucket`, `landing_app_id`, `app_app_id`, `github_actions_role_arn`.

## Orden de implementación
1. VPC + Aurora + assets (sin dependencias externas; `apply` y medir coste en reposo).
2. Cognito + trigger; crear un usuario piloto a mano y comprobar los claims.
3. Email (regla SES en el rule set de tekhos.com) + waitlist; probar con `curl`, comprobar DynamoDB, el correo de confirmación y la redirección de `jano@tekhos.com`.
4. API Gateway vacía con autorizador; `curl` sin token → 401.
5. Landing y app en Amplify con `jano.tekhos.com` y `jano-app.tekhos.com`; autorizar la conexión en consola; primer build desde `main`.
6. OIDC (rol de apply con política de arranque pegada por CLI, rol de plan) + workflows; plan en un PR de prueba y `apply` desde CI idempotente.

## Riesgos
- La política de cuenta que bloquea Function URLs públicas (vista en Fenora) obliga a HTTP API para la waitlist: ya contemplado.
- Amplify y `pnpm` en monorepo: el `cd ../..` del `amplify.yml` es lo que hace funcionar `workspace:*`; si Amplify ignora el `amplify.yml` de la raíz, el `build_spec` del módulo debe llevar lo mismo.
- Aurora en pausa: el primer acceso da `DatabaseResumingException`; 003 debe reintentar hasta ~2 min (como `migrate-public-schema.sh` en Fenora).
