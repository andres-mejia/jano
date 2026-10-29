# Investigación 002 · Infraestructura dev en AWS

Fase 0 de `tasks.md`. Fuentes: `andres-mejia/fintrack` (clon de solo lectura, `main` del 2026-10-29), `~/py/cardea` (`4e080ee`) y la cuenta `966378755474` con el perfil `fintrack-dev`.

## T001 · Módulos de Fenora: qué se replica y qué se recorta

| Módulo Fenora | Módulo Jano | Se replica | Se recorta |
|---|---|---|---|
| `aurora` | `aurora` | Serverless v2, subnet group, SG propio, `manage_master_user_password`, cifrado, auto-pause en dev | RDS Proxy y su rol, ingress desde Lambdas en VPC; se activa la Data API (`enable_http_endpoint`) |
| `cognito` | `cognito` | Pool con email como usuario, cliente público sin secret, dominio Hosted UI de prefijo | IdP de Google y Apple, passkeys, segundo dominio |
| `landing` | `landing` | Amplify `WEB`, `build_spec` con `appRoot`, rama `main`, asociación de dominio | Redirección `www`, webhook, CodeStar Connection y despliegue por zip (se usa el token de `gh`, como Cardea) |
| `cdn` | `app-hosting` | Amplify `WEB_COMPUTE` para Next.js con `NEXT_PUBLIC_*` desde outputs | Webhook, CodeStar Connection |
| `waitlist` | `waitlist` | DynamoDB `email` PK + GSI `created_at-index` (`partition`, `created_at`) + TTL, HTTP API (no Function URL: la cuenta las bloquea), throttling, rate limit por IP en la Lambda, `ses:FromAddress` condicionado | CMK de KMS (cifrado gestionado por AWS), cabeceras `x-fenora-*`; Node 22 en vez de 20 |
| `email` | `email` | Configuration set con eventos a CloudWatch, SNS y alarmas de reputación | Identidad de dominio, DKIM, MAIL FROM, registros DNS y recepción (los tiene `tekhos.com`, ver T002) |
| `assets` | `assets` | Bucket privado, versionado, bloqueo público, lifecycle | CloudFront con OAC, par de claves de URL firmadas y CMK (SSE-S3) |
| `github-oidc` | `github-oidc` | Roles por OIDC con `sub` y `job_workflow_ref` | Creación del proveedor OIDC (ya existe: se lee), permisos de ECR, escenarios de datos |
| `dns` | ninguno | — | Certificado ACM propio y zona: Amplify gestiona sus certificados y la zona `tekhos.com` solo se lee (`data`) |
| `vpc` | `vpc` | VPC propia con subredes privadas en varias AZ | IGW, subredes públicas, NAT, endpoints: solo alberga el subnet group de Aurora |
| `api-gateway` | `api-gateway` | HTTP API con autorizador JWT de Cognito | REST API y WAF de Fenora (la forma es la de Cardea) |

## T002 · Lo que Cardea ya resolvió en la misma cuenta

| Tema | Cómo quedó en Cardea | En Jano |
|---|---|---|
| Rol de apply | `cardea-dev-github-actions`, trust `ref:refs/heads/main` + `job_workflow_ref` de `infra-apply.yml`; política permanente mínima y política de arranque `arranque-ci-caduca-2027-01-31` (`Allow *` con `DateLessThan` y 8 `Deny` de guarda) pegada con `aws iam put-role-policy` desde `infra/bootstrap/` | Igual, con `jano-*`. Cambio obligado: el estado de Jano vive en `fenora-terraform-state-*` y `fenora-terraform-locks`, que el `Deny` `NoTocarFenora` de Cardea bloquea; la política de Jano excluye del `Deny` la clave `jano/*` y la tabla de locks (`NotResource`) |
| Rol de plan | `cardea-dev-github-actions-plan`, trust `pull_request` + `infra-plan.yml`; `ReadOnlyAccess` + estado y locks, con `Deny` de planos de datos | Igual, con el bucket y la tabla de Fenora acotados a la clave `jano/` |
| Proveedor OIDC | Lo gestiona el estado de Fenora; se lee con `data` | Igual |
| Correo entrante | **Ninguna regla propia.** El MX de `tekhos.com` apunta a `inbound-smtp.us-east-1`; el rule set activo de us-east-1 es `tekhos-inbound` (stack CloudFormation `tekhos-email-receiving`) con `catch-all-tekhos` para todo el dominio: S3 + Lambda `tekhos-email-forwarder` con `FORWARD_TO=ramejiafernandez@gmail.com` | Igual: `jano@tekhos.com` ya se redirige sin tocar nada. El rule set activo de eu-west-1 es `fenora-dev-rules` (de Fenora), no de `tekhos.com`: añadirle una regla no recibiría nada y tocaría recursos de Fenora |
| Correo saliente | Identidad `tekhos.com` verificada (fuera de Terraform); el módulo `email` solo crea configuration set y alarmas | Igual, `jano-dev` |
| Amplify | Módulo `amplify-site` (uno para `WEB` y `WEB_COMPUTE`), asociación con `domain_name = tekhos.com` y `sub_domain` por prefijo, `wait_for_verification = false`; conexión con GitHub por `-var github_access_token=$(gh auth token)` en el apply que crea las apps e `ignore_changes = [repository, access_token]` | Igual. Se mantienen los dos módulos que fija FR-002 (`landing` y `app-hosting`) con la forma de `amplify-site` |
| Cognito | Pool con `allow_admin_create_user_only`, contraseña ≥ 12 con los cuatro tipos, MFA TOTP opcional, cliente con code + PKCE, tokens de 1 h | Igual, más atributos `tenant_id` y `role` y el trigger pre-token |

## T003 · Cuenta

```
aws sts get-caller-identity --profile fintrack-dev        -> 966378755474 (SSO AdministratorAccess)
aws s3 ls s3://fenora-terraform-state-966378755474/        -> PRE dev/   (jano/ aún no existe)
aws dynamodb describe-table --table-name fenora-terraform-locks -> ACTIVE
aws route53 list-hosted-zones-by-name --dns-name tekhos.com -> /hostedzone/Z025408038NPHX3W382AH tekhos.com. (pública)
aws ses describe-active-receipt-rule-set --region eu-west-1 -> fenora-dev-rules (catch-all-fenora.ai)
aws ses describe-active-receipt-rule-set --region us-east-1 -> tekhos-inbound (catch-all-tekhos)
aws sesv2 get-email-identity tekhos.com (eu-west-1)         -> verificada, DKIM SUCCESS
dig MX tekhos.com                                           -> inbound-smtp.us-east-1.amazonaws.com
aws ce list-cost-allocation-tags --tag-keys Project         -> Inactive
aws budgets describe-budgets                                -> fenora-dev-mensual 165 USD (cuenta entera)
```

Consecuencias:

- **SES**: FR-002, la decisión 5 del plan y T030 cambian: no hay regla de recepción de Jano. Se comprueba la redirección enviando a `jano@tekhos.com`.
- **Budgets**: la etiqueta `Project` no está activa como etiqueta de asignación de costes. Se activa una vez por CLI (`aws ce update-cost-allocation-tags-status`) para que el presupuesto de Jano filtre por `Project=jano`; los importes por etiqueta tardan hasta 24 h en aparecer. La moneda de Budgets en la cuenta es USD.

## Evidencia por fase

### Fase 1 · Datos y almacenamiento (2026-10-29)

```
terraform apply tfplan                 -> Apply complete! Resources: 19 added, 0 changed, 0 destroyed.
aws rds-data execute-statement --sql "select 1 as uno, version()"
                                       -> [1, 'PostgreSQL 16.15 on aarch64-linux, compiled by gcc-10.5.0, 64-bit']
aws budgets describe-budget --budget-name jano-dev-monthly
                                       -> 50.0 USD, TagKeyValue user:Project$jano
```

T015 (coste en reposo a las 24 h) queda pendiente: se mide el 2026-10-30 en Cost Explorer.

### Fase 2 · Identidad (2026-10-29)

```
node --test infra/modules/cognito/lambda/pre-token/index.test.mjs -> tests 4, pass 4, fail 0
terraform apply tfplan                               -> Apply complete! Resources: 8 added, 0 changed, 0 destroyed.
aws cognito-idp initiate-auth --auth-flow USER_AUTH (piloto@rumbonorte.example, tenant-rumbonorte, owner)
  ID token -> {'aud': 'npfu3ule0vnct9lhup6b7438o', 'token_use': 'id', 'custom:tenant_id': 'tenant-rumbonorte',
               'custom:role': 'owner', 'email': 'piloto@rumbonorte.example'}
initiate-auth de un usuario sin tenant (borrado después)
  -> UserLambdaValidationException: PreTokenGeneration failed with error usuario sin custom:tenant_id.
```

### Fase 3 · Correo y acceso anticipado (2026-10-29)

```
node --test infra/modules/waitlist/lambda/handler/index.test.mjs -> tests 6, pass 6, fail 0 (201, 409, 429, honeypot, 400, 405)
terraform apply tfplan                            -> Apply complete! Resources: 16 added, 0 changed, 0 destroyed.
curl -X POST $WAITLIST_URL -d '{"email":"success@simulator.amazonses.com"}'  -> {"ok":true} 201
mismo POST otra vez                               -> {"ok":false,"error":"already_registered"} 409
OPTIONS con origin https://evil.example           -> 204 sin access-control-allow-origin
OPTIONS con origin https://jano.tekhos.com        -> 204 access-control-allow-origin: https://jano.tekhos.com
aws dynamodb get-item                             -> {email, partition: waitlist, created_at, locale: es, source: landing}
Gmail (redirección del catch-all)                 -> aviso de jano@tekhos.com a jano@tekhos.com recibido
```

Se prueba con el simulador de SES y no con `prueba@example.com`: `example.com` no acepta correo y el rebote contaría en la reputación de SES, que es de toda la cuenta. El 429 se cubre con el test unitario para no generar cinco avisos reales; el item de prueba se borró después.
