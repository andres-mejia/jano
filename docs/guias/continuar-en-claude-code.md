# Continuar en Claude Code (VS Code) con Spec Kit

Guía para retomar el trabajo en local. El repo queda en `~/py/jano`; la cuenta AWS es la de Fenora y el perfil local es `fintrack-dev`.

## 1. Preparar el entorno (una vez)

```bash
cd ~/py
git clone git@github.com:andres-mejia/jano.git
cd jano
git checkout feat/mvp-scaffold          # mientras no esté fusionada

corepack enable && corepack prepare pnpm@10.4.0 --activate
pnpm install
pnpm type-check && pnpm build && pnpm test

aws sso login --profile fintrack-dev
aws sts get-caller-identity --profile fintrack-dev

# Spec Kit (GitHub). Si no tienes uv: https://docs.astral.sh/uv/
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git
specify init --here --ai claude --force
# init puede reescribir la constitución con su plantilla; la nuestra ya está en git:
git checkout -- .specify/memory/constitution.md
```

Tras `specify init`, Claude Code tendrá los comandos `/speckit.constitution`, `/speckit.specify`, `/speckit.clarify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`, `/speckit.analyze` y `/speckit.checklist`.

## 2. Qué hay ya

| Ruta | Estado |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | Constitución del repo y adaptador para Claude Code |
| `.specify/memory/constitution.md` | Constitución para Spec Kit (derivada de `AGENTS.md`) |
| `specs/001-base-monorepo` | Implementada en `feat/mvp-scaffold`: landing, app con mocks, contrato, dominio, CI |
| `specs/002-infra-dev-aws` | spec + plan + tasks: la siguiente feature |
| `specs/003-api-y-motor`, `004-agentes-ia`, `005-canales-microsoft-365` | spec; el plan se hace con `/speckit.plan` cuando toque |
| `contracts/openapi/jano-api.yaml` | Contrato de la API, fuente de las pantallas |
| `packages/domain` | Tipos, esquemas zod, máquina de estados, tests |
| `frontend/jano-web`, `frontend/jano-app` | Builds verdes; la app funciona en modo mock |
| `infra/environments/dev` | `versions`, `backend`, `provider`, `variables`; `main.tf` vacío a propósito |
| `docs/ADR` | ADR-001 (monorepo y plataforma), ADR-002 (IA decide, motor ejecuta) |
| `docs/producto` | Pitch en PDF: pantallas de referencia |

## 3. Decisiones que están esperando a Andrés

1. **Dominio** del producto y si la zona de Route 53 existe.
2. **VPC** propia para Aurora o reutilizar la de Fenora.
3. Remitente SES y tenant de Microsoft 365 de pruebas.

## 4. Prompt para la primera sesión en Claude Code

Pégalo tal cual en Claude Code dentro de `~/py/jano`:

```text
Estás en ~/py/jano, el monorepo de Jano (equipo comercial de IA para pymes B2B). Lee en este orden: CLAUDE.md, AGENTS.md, .specify/memory/constitution.md, docs/ADR/ADR-001-monorepo-y-plataforma.md, docs/ADR/ADR-002-ia-decide-motor-ejecuta.md y docs/guias/continuar-en-claude-code.md. No resumas lo leído; actúa.

Contexto que no está en el repo:
- La cuenta AWS es la de Fenora (repo andres-mejia/fintrack, clonado en ~/py/fintrack si existe; si no, clónalo en solo lectura para consultar infra/modules). Perfil local: `aws sso login --profile fintrack-dev`; ya está iniciado. Región eu-west-1. Estado de Terraform compartido: bucket fenora-terraform-state-<ACCOUNT_ID> (obtén el ID con sts) y tabla fenora-terraform-locks, con la clave jano/dev/terraform.tfstate que ya fija infra/environments/dev/backend.tf.
- Trabajamos con Spec-Driven Development usando Spec Kit (comandos /speckit.*). Las specs viven en specs/. La 001 está implementada en la rama feat/mvp-scaffold; la 002 (infra dev) tiene spec, plan y tasks y es la siguiente.
- Identidad git: Andrés Mejía <49398769+andres-mejia@users.noreply.github.com>. Nunca una identidad de IA, nunca Co-Authored-By de IA, nunca emojis en commits. Parada obligatoria antes de cualquier push o PR: me reportas rama, ficheros, mensaje y validaciones y esperas mi OK.

Tarea de esta sesión:
1. Comprueba el entorno: `pnpm type-check && pnpm build && pnpm test` en verde, `aws sts get-caller-identity --profile fintrack-dev` devuelve la cuenta, `terraform -chdir=infra/environments/dev init -backend=false && terraform validate`.
2. Abre el PR de feat/mvp-scaffold contra main siguiendo la parada obligatoria (primero me enseñas rama, ficheros y mensaje). El cuerpo del PR lleva la evidencia de las validaciones (comando y salida), sin atribución de IA.
3. Lee specs/002-infra-dev-aws/spec.md y hazme las tres preguntas abiertas ([NEEDS CLARIFICATION]) de una en una con tu recomendación. Con mis respuestas, ejecuta /speckit.clarify sobre la 002 y actualiza spec.md y plan.md.
4. Crea la rama infra/dev-base y ejecuta /speckit.implement sobre specs/002-infra-dev-aws/tasks.md por fases. Antes de cada `terraform apply` me enseñas el plan y esperas mi OK; aplica con `-var aws_profile=fintrack-dev`. Replica la forma de los módulos de ~/py/fintrack/infra/modules (naming jano-dev-*, tags, variables, outputs, comentarios de decisión), no su contenido literal, y deja fuera VPC para Lambda, NAT, RDS Proxy, ECR, passkeys e IdP sociales.
5. Al cerrar cada fase: `terraform fmt -recursive`, `terraform validate`, commit en infra/dev-base y parada para el OK.

Pregúntame lo que necesites decidir yo; lo que sea una convención del repo, aplícala sin preguntar.
```

## 5. Después de la 002

- `/speckit.clarify` y `/speckit.plan` sobre `specs/003-api-y-motor` (backend en TypeScript, ADR-001).
- `/speckit.plan` sobre `004-agentes-ia` una vez cotizados los proveedores de datos y verificación.
- `005-canales-microsoft-365` cuando exista el dictamen legal y un tenant de pruebas.
