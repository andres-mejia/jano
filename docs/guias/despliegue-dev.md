# Despliegue del entorno dev

Runbook de `infra/` (spec 002). Cuenta `966378755474`, región `eu-west-1`, compartida con Fenora y Cardea. El decidir qué se replica de cada una está en `specs/002-infra-dev-aws/research.md`.

## Qué existe fuera de Terraform

| Pieza | Dónde vive | Qué hace Jano con ella |
|---|---|---|
| Bucket de estado `fenora-terraform-state-<cuenta>` y tabla `fenora-terraform-locks` | Bootstrap de Fenora | Usa la clave `jano/dev/terraform.tfstate` (FR-001) |
| Zona Route 53 `tekhos.com` | Creada a mano | La lee (`data`); Amplify escribe los registros de `jano` y `jano-app` |
| Identidad SES `tekhos.com` (eu-west-1) | Stack `tekhos-email-sending` | Envía como `jano@tekhos.com` |
| Recepción de `tekhos.com` (us-east-1) | Stack `tekhos-email-receiving`: rule set `tekhos-inbound`, catch-all a S3 y Lambda `tekhos-email-forwarder` | Nada: ya redirige `jano@tekhos.com` a `ramejiafernandez@gmail.com` |
| Proveedor OIDC de GitHub | Estado de Fenora | Lo lee (`data`) |
| Etiqueta de costes `Project` | Activada por CLI el 2026-10-29 | El presupuesto `jano-dev-monthly` filtra por `Project=jano` |
| Secreto `jano/dev/google-oauth` | Cargado por CLI desde el JSON del client de Google el 2026-10-29 (spec 006) | Terraform lo lee para el IdP de Google de Cognito |
| Client OAuth de Google | Proyecto de Google Cloud «Jano», en modo Testing | Su única URI de redirección es la de Cognito de Jano |
| Política de arranque del rol de CI | `infra/bootstrap/`, pegada por CLI | Ver `infra/bootstrap/README.md` |

## Desplegar a mano

```bash
aws sso login --profile fintrack-dev
infra/scripts/deploy-dev.sh --plan-only          # init + validate + plan
infra/scripts/deploy-dev.sh                      # lo mismo y, tras escribir «si», apply del plan guardado
```

El script construye el backend (Terraform empaqueta `backend/dist/api`), resuelve la cuenta con `sts`, pasa el bucket de estado por `-backend-config` y aplica exactamente el plan que se ha revisado (`tfplan`) y después las migraciones de Aurora (`pnpm --filter @jano/backend migrar`). Nada se aplica sin plan revisado (AGENTS.md §8).

Variables: los valores por defecto de `infra/environments/dev/variables.tf` son los de dev; `terraform.tfvars.example` muestra cuáles se pueden cambiar. El token de GitHub nunca va en un fichero.

## Desplegar desde CI

- **PR que toca `infra/**`**: `infra-plan.yml` asume `jano-dev-github-actions-plan` (solo lectura), hace `plan`, pasa la guardia en modo informativo y comenta el plan en el PR.
- **Push a `main` que toca `infra/**`**: `infra-apply.yml` asume `jano-dev-github-actions`, construye el backend, hace `plan`, la guardia lo para si destruye datos (Aurora, Cognito, S3, DynamoDB…), aplica ese mismo plan y migra Aurora. Para autorizar un borrado legítimo: `workflow_dispatch` con `permitir_destruccion` y las direcciones exactas.
- Secretos del repo: `AWS_GITHUB_OIDC_ROLE_ARN` y `AWS_GITHUB_OIDC_PLAN_ROLE_ARN` (outputs `github_actions_role_arn` y `github_actions_plan_role_arn`).

## Pasos manuales (una vez)

1. **Conexión Amplify–GitHub.** Como en Cardea: el token de `gh` va en el apply que **crea** las apps; después `ignore_changes` impide que los applies sin token la borren.
   ```bash
   # gh ≥ 2.17: gh auth token. gh 2.4 (Ubuntu) no lo tiene: sale del status.
   export TF_VAR_github_access_token="$(gh auth token 2>/dev/null || gh auth status --show-token 2>&1 | grep -oE 'gh[opu]_[A-Za-z0-9_]+' | head -1)"
   infra/scripts/deploy-dev.sh
   unset TF_VAR_github_access_token
   ```
   Por variable de entorno y no con `-var`, para que el token no quede en la línea de comandos. Si llega vacío o con texto que no es un token, Amplify responde `There was an issue setting up your repository` con `Bad credentials` dentro.
   Si las apps ya existían sin conexión, se recrean añadiendo `-replace=module.landing.aws_amplify_app.this -replace=module.app_hosting.aws_amplify_app.this`.
2. **Empresas y usuarios (spec 007).** No hay registro abierto: el equipo de Jano da de alta cada empresa y su primer owner, que recibe un correo de Cognito; después el owner invita a su equipo desde **Equipo** en la app. Con `AWS_PROFILE=fintrack-dev` y el entorno ya inicializado (los scripts leen las salidas de Terraform):
   ```bash
   pnpm --filter @jano/backend alta-tenant --tenant tenant-faro --nombre "Faro Ingeniería" --owner ana@faro.example
   pnpm --filter @jano/backend suspender-tenant --tenant tenant-faro            # --reactivar para deshacer
   pnpm --filter @jano/backend importar-tenant --tenant tenant-rumbonorte --nombre "Rumbo Norte"   # usuarios que solo estaban en Cognito
   ```
   El id del tenant es `tenant-` más minúsculas, números y guiones; es el `custom:tenant_id` de sus usuarios. Si el email del owner ya existe, el alta no crea nada. Un usuario sin `custom:tenant_id` o con un rol distinto de `owner`/`member` no recibe token (trigger pre-token), y uno desactivado o de una empresa suspendida recibe 403 en la API.
3. **Política de arranque del rol de CI**: `infra/bootstrap/README.md`.
4. **Google (spec 006).** En Google Cloud Console, proyecto «Jano» → Google Auth Platform:
   - **Clients**: client «Web application» sin orígenes JavaScript y con la URI de redirección `https://jano-dev.auth.eu-west-1.amazoncognito.com/oauth2/idpresponse`. Se descarga el JSON a `.credentials/` (ignorado por git).
   - **Audience**: External y en Testing; solo entran las cuentas de «Test users» hasta publicar la app.
   - **Branding**: nombre Jano, página `https://jano.tekhos.com`, dominio autorizado `tekhos.com`.
   - **Data Access**: `openid`, `email`, `profile`.

   El secreto se carga desde el JSON sin imprimir el valor (`create-secret` la primera vez, `put-secret-value` al rotar) y después `deploy-dev.sh`:
   ```bash
   ( umask 077; jq -c '{client_id: .web.client_id, client_secret: .web.client_secret}' .credentials/client_secret_*.json > /tmp/g.json )
   aws secretsmanager put-secret-value --secret-id jano/dev/google-oauth --secret-string file:///tmp/g.json --profile fintrack-dev
   shred -u /tmp/g.json
   ```

   Google solo da acceso a usuarios dados de alta (paso 2) con el mismo email, en minúsculas: el trigger PreSignUp enlaza la identidad de Google con ese usuario, que conserva tenant y rol. Un email sin alta vuelve a `/login` con «Tu cuenta de Google no tiene acceso a Jano».
5. **Secretos de GitHub** con los dos ARN de los roles:
   ```bash
   gh secret set AWS_GITHUB_OIDC_ROLE_ARN --body "$(terraform -chdir=infra/environments/dev output -raw github_actions_role_arn)"
   gh secret set AWS_GITHUB_OIDC_PLAN_ROLE_ARN --body "$(terraform -chdir=infra/environments/dev output -raw github_actions_plan_role_arn)"
   ```

## Comprobaciones

```bash
cd infra/environments/dev
# Aurora (la primera llamada tras la pausa da DatabaseResumingException: reintentar)
aws rds-data execute-statement --resource-arn "$(terraform output -raw aurora_cluster_arn)" \
  --secret-arn "$(terraform output -raw aurora_secret_arn)" --database jano_dev --sql "select 1" --profile fintrack-dev
# Formulario
curl -s -X POST "$(terraform output -raw waitlist_endpoint_url)" -H 'content-type: application/json' \
  -d '{"email":"prueba@example.com"}' -w ' %{http_code}\n'
# API: sin token 401; con el ID token del piloto, 501 hasta que exista el backend
curl -s "$(terraform output -raw api_base_url)/dashboard/summary" -w ' %{http_code}\n'
```

## Coste en reposo

Aurora pausada solo cobra almacenamiento; DynamoDB, Lambda, API Gateway y Amplify son por uso; Secrets Manager cobra 0,40 $/mes por el secreto de Aurora. La cifra medida está en `research.md` (T015).
