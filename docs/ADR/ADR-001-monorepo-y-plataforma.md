# ADR-001 · Monorepo y plataforma

**Estado**: aceptada · **Fecha**: 2026-10-29

## Contexto
Jano arranca con un desarrollador, un socio de producto y cero clientes. Fenora (`andres-mejia/fintrack`) ya tiene una plataforma AWS serverless en la misma cuenta, con Terraform, Amplify, Cognito, Aurora Serverless v2, Bedrock y un flujo de trabajo con agentes probado. Hay que decidir estructura del repo, stack y hasta dónde se reutiliza Fenora.

## Decisión
1. **Un monorepo** (`andres-mejia/jano`) con workspace pnpm: `frontend/jano-web` (Astro 5, estático), `frontend/jano-app` (Next.js 16), `packages/domain` (tipos y esquemas), `contracts/`, `infra/`, `docs/`, `specs/`.
2. **Misma plataforma que Fenora**: cuenta AWS, región `eu-west-1`, bucket y tabla de estado de Terraform compartidos (clave `jano/dev/…`), perfil local `fintrack-dev`, OIDC desde GitHub Actions, Amplify para las dos apps, Cognito, API Gateway HTTP, Aurora Serverless v2 con Data API, S3, SES, Bedrock.
3. **Forma, no copia**: los módulos de Terraform replican los patrones de `fintrack/infra/modules` (naming, tags, variables, outputs, comentarios sobre decisiones) y descartan lo que Jano no usa: VPC para Lambda y NAT, RDS Proxy, Quarkus/ECR, passkeys, IdP sociales, WAF en dev. *Enmienda (spec 006, 2026-10-29)*: Google entra como IdP, con un client OAuth propio de Jano en `jano/<env>/google-oauth`, solo para usuarios ya dados de alta por el administrador; sigue sin haber alta abierta ni otros IdP.
4. **TypeScript en todo el monorepo**, incluido el backend (decisión de Andrés, 2026-10-29): tipos compartidos con la app vía `@jano/domain`, un solo toolchain, Lambdas en zip sin ECR, mismo patrón que `fintrack/infra/modules/advisor-api/lambda` (la pieza de IA de Fenora ya es Node).
5. **Dominio y correo como Cardea** (el otro producto de la misma cuenta): subdominios de `tekhos.com` (`jano.tekhos.com`, `jano-app.tekhos.com`) sobre la zona existente, y `jano@tekhos.com` como remitente y buzón, que ya recibe el catch-all de `tekhos.com` (us-east-1), igual que Cardea. Dominio propio cuando se decida el nombre definitivo.
6. **CI como Cardea**: rol de apply con política de arranque del patrón Fenora (Allow * con caducidad y Deny de guarda) y rol de plan de solo lectura para PR.

## Alternativas
- **Dos repos (landing y app)**: descartado; el contrato y el dominio son compartidos y una sola rama viva simplifica el flujo con agentes.
- **Bucket de estado propio**: descartado; exige bootstrap y no aísla nada dentro de la misma cuenta.
- **Backend en Java 21 + Quarkus como Fenora**: descartado para el MVP. A favor: reutilizar `backend/shared`, los arch-tests y el pipeline de ECR de Fenora, y el dominio natural de Andrés. En contra: dos toolchains, duplicar el dominio ya definido en `packages/domain`, y una carga (orquestación de IA e I/O, sin cálculo) donde el rendimiento de Quarkus no compra nada medible.
- **Spring Boot 4**: descartado. En Lambda es el peor cold start de las opciones salvo GraalVM native o SnapStart, y si empuja a ECS siempre encendido rompe el coste cercano a cero. Fenora ya lo rechazó.
- **Python + FastAPI**: descartado como único backend por duplicar dominio y toolchain. Queda como opción para los agentes y los evals (spec 004) si el ecosistema de IA lo pide: la frontera motor/agentes está diseñada como puertos para que ese cambio no toque el motor.

## Consecuencias
- El coste con cero clientes es casi cero y la operación es la misma que ya conoce Andrés.
- Cualquier cambio en el bucket o la tabla de estado de Fenora afecta a Jano; se documenta en ambos repos.
- `packages/domain` es la única definición del dominio: la importan la app y el backend. Si un adaptador de IA acaba en Python, el contrato interno del puerto es el puente; nada del motor ni del frontend cambia.
