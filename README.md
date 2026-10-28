# Jano

Equipo comercial de IA para pymes B2B españolas. Encuentra cuentas, localiza al contacto, escribe en el momento oportuno y agenda la reunión. La IA decide; un motor con reglas ejecuta; tú apruebas lo que sale con tu nombre.

Estado: borrador de producto en implementación. El pitch y las pantallas de referencia están en `docs/producto/`.

## Estructura

| Ruta | Qué es |
|---|---|
| `frontend/jano-web` | Landing pública (Astro 5, estática) |
| `frontend/jano-app` | La app (Next.js 16, Cognito, API tipada) |
| `packages/domain` | Tipos y esquemas del dominio compartidos |
| `contracts/openapi` | Contrato de la API, contract-first |
| `infra/` | Terraform: Amplify, Cognito, API Gateway, Aurora, S3, waitlist |
| `docs/` | ADR, producto, guías |

## Arranque local

```bash
corepack enable && corepack prepare pnpm@10.4.0 --activate
pnpm install
pnpm dev:web   # landing en http://localhost:4321
pnpm dev:app   # app en http://localhost:3000 con datos de ejemplo (sin Cognito)
```

La app arranca en modo mock por defecto (`NEXT_PUBLIC_AUTH_MODE=mock`). Para apuntarla a Cognito y a la API real, copia `frontend/jano-app/.env.example` a `.env.local` y rellena los valores que da `terraform output`.

## Verificación

```bash
pnpm type-check
pnpm build
terraform -chdir=infra/environments/dev fmt -check -recursive
```

## Despliegue

`docs/guias/despliegue-dev.md`. Amplify construye las dos apps en cada push a `main`; la infraestructura se aplica con Terraform desde `infra/environments/dev`.

## Normas

`AGENTS.md` es la constitución del repo. `CLAUDE.md` dice cómo se ejecuta aquí con Claude Code.
