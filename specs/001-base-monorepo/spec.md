# Feature 001 · Base del monorepo: landing, app y contrato

**Rama**: `feat/mvp-scaffold` · **Estado**: implementada en esta rama, pendiente de PR y de cableado en Amplify · **Fecha**: 2026-10-29

## Escenarios de usuario

### US1 · Una pyme descubre Jano y pide acceso (P1)
Un director comercial llega a la landing, entiende en un minuto qué hace Jano, qué decide la IA y qué no, y deja su email para el acceso anticipado.

**Aceptación**
1. Dada la landing publicada, cuando se abre en móvil o escritorio, se ve en la primera pantalla la propuesta, la promesa «tú apruebas» y el formulario de acceso.
2. Dado un email válido, cuando se envía, el formulario confirma el alta sin recargar; con el endpoint ausente simula el éxito y lo indica el código, no el usuario.
3. Dado un email repetido, cuando se envía, el formulario lo da por hecho (idempotente) sin revelar si existía.

### US2 · El cliente entra en la app y ve el estado de su campaña (P1)
Con sesión iniciada, ve el centro de mando (KPI, embudo, agentes en vivo, pendientes, reuniones), navega al mapa de flujo, a una campaña con sus cuentas, a un prospect con su recorrido y registro, a la bandeja y a cumplimiento.

**Aceptación**
1. Sin sesión, cualquier ruta de la app redirige a `/login`.
2. En modo mock, la app funciona completa con datos de ejemplo etiquetados «Datos de ejemplo»; ninguna empresa ni persona es real.
3. Cada pantalla consume únicamente operaciones declaradas en `contracts/openapi/jano-api.yaml`.

### US3 · Un desarrollador arranca el repo en diez minutos (P2)
`pnpm install`, `pnpm dev:app` y `pnpm dev:web` funcionan sin credenciales; `pnpm type-check`, `pnpm build` y `pnpm test` son los mismos que corre CI y Amplify.

## Requisitos funcionales

- **FR-001** El monorepo es un workspace pnpm con `frontend/jano-web` (Astro 5, estático), `frontend/jano-app` (Next.js 16, React 19, Tailwind 4), `packages/domain` (TypeScript + zod) e `infra/`.
- **FR-002** La app valida su entorno con zod en build-time: `NEXT_PUBLIC_AUTH_MODE=cognito` exige pool, client y URL de API; `mock` no exige nada.
- **FR-003** La app habla con la API por un único cliente (`apiFetch`) que inyecta el ID token de Cognito, reintenta una vez ante 401 y cierra sesión si persiste.
- **FR-004** El modo mock resuelve todas las operaciones del contrato con estado en memoria, incluidas acciones (aprobar, descartar, detener, afinar ICP).
- **FR-005** La landing lee `PUBLIC_WAITLIST_ENDPOINT`, `PUBLIC_APP_URL` y `PUBLIC_SITE_URL` en build-time y los documenta en `.env.example`.
- **FR-006** CI (`frontend-ci.yml`) ejecuta type-check, build en modo mock y tests en cada PR; `attribution-check.yml` impide atribución de IA; `infra-formato.yml` valida `terraform fmt` y `validate -backend=false`.
- **FR-007** Identidad visual: tokens `--color-jano-*`, fuentes Bricolage Grotesque, Figtree y JetBrains Mono, borde `ai-border` en lo que decide la IA, en app y landing.

## Entidades clave
Campaign/Icp, Account/Contact, Prospect/Sequence/ProspectEvent, InboxItem/Draft, Guardrails/AuditEntry/Connection, DashboardSummary/FlowMap. Definidas en `packages/domain` y replicadas en el contrato.

## Criterios de éxito
- **SC-001** `pnpm type-check && pnpm build && pnpm test` en verde desde la raíz, sin variables de entorno.
- **SC-002** Las siete pantallas de la app renderizan con datos de ejemplo y las acciones cambian el estado visible en la sesión.
- **SC-003** Lighthouse de la landing (móvil) por encima de 90 en rendimiento y accesibilidad. *(pendiente de medir)*
- **SC-004** Ningún commit de la rama lleva atribución de IA (`scripts/check-ai-attribution.sh --commits origin/main..HEAD`).

## Fuera de alcance
Backend real, Terraform de los módulos (002), agentes (004), Microsoft 365 (005), dominio definitivo y textos legales definitivos.

## Pendiente en esta feature
- Cablear las dos apps en Amplify (lo hace 002) y comprobar que `amplify.yml` resuelve `packages/domain` desde la raíz del workspace.
- Capturas de las pantallas en `docs/producto/capturas/` como gate visual (están generadas en la sesión de origen; falta versionarlas).
