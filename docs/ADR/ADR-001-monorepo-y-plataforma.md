# ADR-001 · Monorepo y plataforma

**Estado**: aceptada · **Fecha**: 2026-10-29

## Contexto
Jano arranca con un desarrollador, un socio de producto y cero clientes. Fenora (`andres-mejia/fintrack`) ya tiene una plataforma AWS serverless en la misma cuenta, con Terraform, Amplify, Cognito, Aurora Serverless v2, Bedrock y un flujo de trabajo con agentes probado. Hay que decidir estructura del repo, stack y hasta dónde se reutiliza Fenora.

## Decisión
1. **Un monorepo** (`andres-mejia/jano`) con workspace pnpm: `frontend/jano-web` (Astro 5, estático), `frontend/jano-app` (Next.js 16), `packages/domain` (tipos y esquemas), `contracts/`, `infra/`, `docs/`, `specs/`.
2. **Misma plataforma que Fenora**: cuenta AWS, región `eu-west-1`, bucket y tabla de estado de Terraform compartidos (clave `jano/dev/…`), perfil local `fintrack-dev`, OIDC desde GitHub Actions, Amplify para las dos apps, Cognito, API Gateway HTTP, Aurora Serverless v2 con Data API, S3, SES, Bedrock.
3. **Forma, no copia**: los módulos de Terraform replican los patrones de `fintrack/infra/modules` (naming, tags, variables, outputs, comentarios sobre decisiones) y descartan lo que Jano no usa: VPC para Lambda y NAT, RDS Proxy, Quarkus/ECR, passkeys, IdP sociales, WAF en dev.
4. **TypeScript en todo el monorepo**, incluido el backend (propuesta de la spec 003, pendiente de OK): tipos compartidos con la app vía `@jano/domain`, un solo toolchain, Lambdas en zip sin ECR, mismo patrón que `fintrack/infra/modules/advisor-api/lambda` (la pieza de IA de Fenora ya es Node).
5. **Dominio pendiente**: `domain_name` es variable; hasta decidirlo se usan las URL de Amplify.

## Alternativas
- **Dos repos (landing y app)**: descartado; el contrato y el dominio son compartidos y una sola rama viva simplifica el flujo con agentes.
- **Bucket de estado propio**: descartado; exige bootstrap y no aísla nada dentro de la misma cuenta.
- **Backend en Java 21 + Quarkus como Fenora**: sigue abierto. A favor: reutilizar `backend/shared` y el pipeline de ECR de Fenora. En contra: dos toolchains, cold start con contenedor, duplicar los tipos del dominio, y el motor de Jano es orquestación de IA y estado, no cálculo pesado.
- **Spring Boot WebFlux**: descartado por lo mismo y porque Fenora ya lo rechazó.

## Consecuencias
- El coste con cero clientes es casi cero y la operación es la misma que ya conoce Andrés.
- Cualquier cambio en el bucket o la tabla de estado de Fenora afecta a Jano; se documenta en ambos repos.
- Si el backend acaba en Java, `packages/domain` sigue siendo la fuente de verdad y el contrato OpenAPI el puente; nada del frontend cambia.
