# Feature 002 · Infraestructura dev en AWS

**Rama**: `infra/dev-base` · **Estado**: especificada · **Fecha**: 2026-10-29 · **Depende de**: 001

## Objetivo
Que `main` se publique solo: la landing y la app en Amplify, auth en Cognito, el formulario de acceso con backend real, y la base de datos, el bucket y la API listas para que 003 despliegue el backend. Misma cuenta, mismo estado y misma forma que Fenora.

## Escenarios de usuario

### US1 · Un push a `main` publica landing y app (P1)
**Aceptación**
1. Dado un push a `main` que toca `frontend/jano-web`, Amplify construye y publica la landing en `https://<apex>` y `https://www.<apex>` (redirección a apex).
2. Dado un push que toca `frontend/jano-app` o `packages/domain`, Amplify construye y publica la app en `https://app.<apex>` con `NEXT_PUBLIC_AUTH_MODE=cognito` y las variables del pool inyectadas desde Terraform.
3. Dado un PR, ningún build de Amplify arranca: solo `main` despliega.

### US2 · El formulario de acceso guarda el email y confirma (P1)
**Aceptación**
1. Dado un POST válido desde la landing, se guarda en DynamoDB con el email en minúsculas como clave y se envía un correo de confirmación por SES desde la dirección canónica.
2. Dado el mismo email dos veces, la segunda devuelve 409 y no reenvía el correo.
3. Dadas más de 5 peticiones de la misma IP en una hora, se responde 429.
4. Un origen distinto de apex, www, app y localhost recibe un rechazo CORS.

### US3 · Un usuario piloto inicia sesión con Cognito (P1)
**Aceptación**
1. Existe un User Pool con email como usuario, política de contraseña fuerte, MFA opcional y los atributos `custom:tenant_id` y `custom:role`.
2. Un trigger pre-token-generation añade `custom:tenant_id` y `custom:role` a los claims del ID token.
3. La app en `app.<apex>` inicia sesión con el pool y el cliente que Terraform exporta.

### US4 · CI aplica la infraestructura sin credenciales de larga duración (P2)
**Aceptación**
1. `infra-plan.yml` ejecuta `terraform plan` en cada PR que toque `infra/**` y publica el plan como comentario.
2. `infra-apply.yml` aplica en cada push a `main` que toque `infra/**`, con OIDC, y se detiene si el plan destruye datos.

## Requisitos funcionales

- **FR-001** Estado remoto en el bucket `fenora-terraform-state-<ACCOUNT_ID>` con clave `jano/dev/terraform.tfstate` y la tabla de locks `fenora-terraform-locks` (ya existen). *(Alternativa descartada: bucket propio; exige bootstrap y no aporta aislamiento real dentro de la misma cuenta.)*
- **FR-002** Módulos propios en `infra/modules/`, uno por componente, con la forma de `fintrack/infra/modules`: `cognito`, `landing` (Amplify WEB), `app-hosting` (Amplify WEB_COMPUTE), `waitlist` (DynamoDB + Lambda Node 22 + HTTP API + SES), `email` (identidad SES del dominio, DKIM, configuration set), `aurora` (Serverless v2, min ACU 0, auto-pause 300 s, Data API activada, sin RDS Proxy), `assets` (S3 con cifrado, versionado y bloqueo público), `api-gateway` (HTTP API con autorizador JWT de Cognito, CORS para app y localhost), `github-oidc` (rol para CI con permisos acotados a recursos `jano-*`), `dns` (zona, certificados global y regional).
- **FR-003** Naming `jano-<env>-<componente>`; tags `Project=jano`, `Environment`, `ManagedBy=terraform` por `default_tags`.
- **FR-004** Lambdas fuera de VPC. Aurora en subnets privadas de una VPC propia de Jano con Data API como única vía desde Lambda. *(Si el coste de VPC+NAT no se justifica en dev, se evalúa reutilizar la VPC de Fenora; se decide en el plan con el coste medido.)*
- **FR-005** Secrets en Secrets Manager: credenciales de Aurora (gestionadas por RDS), futura credencial de Microsoft Graph y de proveedores. Ninguna en variables de entorno.
- **FR-006** La landing recibe `PUBLIC_WAITLIST_ENDPOINT`, `PUBLIC_APP_URL` y `PUBLIC_SITE_URL`; la app recibe `NEXT_PUBLIC_*` del pool, del cliente, del dominio Hosted UI y de la URL de la API. Ambas con `AMPLIFY_MONOREPO_APP_ROOT`.
- **FR-007** Amplify instala con `pnpm install --frozen-lockfile` desde la raíz del workspace (`amplify.yml` ya lo hace); el `build_spec` del módulo replica el `amplify.yml` de la raíz.
- **FR-008** Dominio: hasta fijar el definitivo, `domain_name` es variable y la zona de Route 53 se crea a mano una vez; Terraform no crea la zona.
- **FR-009** Observabilidad mínima: log groups con retención de 30 días; alarma de coste mensual (presupuesto AWS Budgets) a 50 € con aviso por email.

## Entidades clave
Ninguna de dominio; recursos AWS descritos arriba. La tabla de waitlist: `email` (PK), `created_at`, `locale`, `source`, `partition` + GSI `created_at-index`, items de rate limit con TTL.

## Criterios de éxito
- **SC-001** `terraform plan` en dev sin cambios tras el primer `apply` (idempotente).
- **SC-002** Landing y app accesibles por HTTPS en sus dominios; un push de prueba a `main` publica en menos de 10 minutos.
- **SC-003** Un alta en el formulario aparece en DynamoDB y llega el correo de confirmación.
- **SC-004** Un usuario creado a mano en el pool entra en la app y el ID token lleva `custom:tenant_id`.
- **SC-005** Coste estimado con cero tráfico por debajo de 15 €/mes (Aurora en pausa; sin NAT si FR-004 lo permite).

## Fuera de alcance
Lambdas del backend (003), colas y scheduler (003), WAF (se valora en producción), entorno de producción.

## Dudas abiertas para Andrés
- **[NEEDS CLARIFICATION]** Dominio definitivo (`jano.ai`, `jano.es`, otro) y si la zona ya existe.
- **[NEEDS CLARIFICATION]** VPC propia para Aurora o reutilizar la de Fenora (`fenora-dev`); la propia cuesta un NAT si alguna Lambda la necesita, y hoy ninguna lo necesita.
- **[NEEDS CLARIFICATION]** Dirección remitente de SES (`hola@<apex>`) y si el dominio de envío de los clientes se gestiona en 005 o aquí.
