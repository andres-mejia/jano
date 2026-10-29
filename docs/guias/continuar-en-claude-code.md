# Continuar en Claude Code (VS Code) con Spec Kit

Guía para retomar el trabajo en local. El repo queda en `~/py/jano`; la cuenta AWS es la de Fenora y Cardea y el perfil local es `fintrack-dev`.

## 1. Preparar el entorno (una vez)

```bash
cd ~/py/jano
git fetch origin && git checkout main && git pull
git checkout docs/lineamiento-cardea     # mientras no esté fusionada

nvm install 22 && nvm use 22             # .nvmrc; corepack no vale si el PATH trae un Node viejo
npm i -g pnpm@10.4.0
pnpm install
pnpm type-check && pnpm build && pnpm test

aws sso login --profile fintrack-dev
aws sts get-caller-identity --profile fintrack-dev

# Spec Kit (GitHub), versión estable desde PyPI. Si no tienes uv: https://docs.astral.sh/uv/
uv tool install --force specify-cli
specify check                                     # nombre de la integración de Claude Code (normalmente `claude`)
specify init --here --integration claude --force  # en 1.2.x el flag es --integration (antes --ai)
# init puede reescribir la constitución con su plantilla; la nuestra ya está en git:
git checkout -- .specify/memory/constitution.md
```

Tras `specify init`, Claude Code tendrá los comandos `/speckit-constitution`, `/speckit-specify`, `/speckit-clarify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, `/speckit-analyze` y `/speckit-checklist`.

## 2. Qué hay ya

| Ruta | Estado |
|---|---|
| `AGENTS.md`, `CLAUDE.md` | Constitución del repo y adaptador para Claude Code |
| `.specify/memory/constitution.md` | Constitución para Spec Kit (derivada de `AGENTS.md`) |
| `specs/001-base-monorepo` | Implementada y en `main`: landing, app con mocks, contrato, dominio, CI |
| `specs/002-infra-dev-aws` | spec + plan + tasks con todas las decisiones tomadas: la siguiente feature |
| `specs/003-api-y-motor`, `004-agentes-ia`, `005-canales-microsoft-365` | spec; el plan se hace con `/speckit-plan` cuando toque |
| `contracts/openapi/jano-api.yaml` | Contrato de la API, fuente de las pantallas |
| `packages/domain` | Tipos, esquemas zod, máquina de estados, tests |
| `frontend/jano-web`, `frontend/jano-app` | Builds verdes; la app funciona en modo mock |
| `infra/environments/dev` | `versions`, `backend`, `provider`, `variables`; `main.tf` vacío a propósito |
| `docs/ADR` | ADR-001 (monorepo, plataforma, TypeScript, dominio y CI como Cardea), ADR-002 (IA decide, motor ejecuta) |
| `docs/producto` | Pitch en PDF y capturas de las pantallas |

## 3. Decisiones ya tomadas (mismo lineamiento que Cardea, misma cuenta)

| Tema | Decisión |
|---|---|
| Backend | TypeScript (Node 22), dominio compartido en `packages/domain` (ADR-001) |
| Dominio | `jano.tekhos.com` (landing) y `jano-app.tekhos.com` (app) sobre la zona existente de `tekhos.com`; Cognito con prefijo `jano-dev` |
| Correo | Sin regla propia: el catch-all de `tekhos.com` (us-east-1) redirige `jano@tekhos.com` a `ramejiafernandez@gmail.com`, como en Cardea; remitente `jano@tekhos.com` |
| Rol de apply | Patrón Fenora: política de arranque `Allow *` con caducidad y `Deny` de guarda, pegada por CLI una vez |
| Rol de plan | `jano-dev-github-actions-plan`, solo lectura, acotado a `pull_request` |
| Aurora | Privada + Data API, Lambdas sin VPC (el backend es TypeScript; no aplica el motivo JDBC/Helm de Cardea). Si Andrés prefiere unificar con Cardea: VPC + NAT instance + bastión SSM |
| Estado Terraform | Bucket `fenora-terraform-state-<ACCOUNT_ID>` y tabla `fenora-terraform-locks`, clave `jano/dev/terraform.tfstate` |

Lo único abierto es la fila de Aurora, y solo si Andrés quiere un patrón único en la cuenta.

## 4. Prompt para la primera sesión en Claude Code

Pégalo tal cual en Claude Code dentro de `~/py/jano`:

```text
Estás en ~/py/jano, el monorepo de Jano (equipo comercial de IA para pymes B2B). Lee en este orden: CLAUDE.md, AGENTS.md, .specify/memory/constitution.md, docs/ADR/ADR-001-monorepo-y-plataforma.md, docs/ADR/ADR-002-ia-decide-motor-ejecuta.md, docs/guias/continuar-en-claude-code.md y specs/002-infra-dev-aws/{spec,plan,tasks}.md. No resumas lo leído; actúa.

Contexto que no está en el repo:
- La cuenta AWS es la misma que Fenora (~/py/fintrack, repo andres-mejia/fintrack) y que Cardea (~/py/cardea). Si falta alguno de los dos clones, clónalo en solo lectura para consultar infra/modules. Perfil local: `aws sso login --profile fintrack-dev`, ya iniciado. Región eu-west-1. Estado de Terraform compartido: bucket fenora-terraform-state-<ACCOUNT_ID> (obtén el ID con sts) y tabla fenora-terraform-locks, con la clave jano/dev/terraform.tfstate que ya fija infra/environments/dev/backend.tf.
- Jano sigue el mismo lineamiento que Cardea en todo lo transversal de la cuenta: subdominios de tekhos.com (jano.tekhos.com y jano-app.tekhos.com) sobre la zona existente de Route 53; reutilizar el rule set de recepción SES de tekhos.com con una regla para jano@tekhos.com y la misma redirección que Cardea; rol de apply con el patrón Fenora (política de arranque Allow * con caducidad y Deny de guarda, pegada por CLI una vez) y rol de plan de solo lectura para PR. Donde Cardea ya resolvió algo (Terraform de dominio, SES, OIDC, Amplify), copia la forma desde ~/py/cardea cambiando nombres cardea-* por jano-*; no reinventes.
- Trabajamos con Spec-Driven Development usando Spec Kit (comandos /speckit-*). La spec 001 está en main; la 002 (infra dev) tiene spec, plan y tasks cerrados y es la que toca ahora. El backend será TypeScript (ADR-001).
- Identidad git: Andrés Mejía <49398769+andres-mejia@users.noreply.github.com>. Nunca una identidad de IA, nunca Co-Authored-By de IA, nunca emojis en commits. Parada obligatoria antes de cualquier push o PR: me reportas rama, ficheros, mensaje y validaciones y esperas mi OK.

Tarea de esta sesión:
1. Comprueba el entorno: `pnpm type-check && pnpm build && pnpm test` en verde; `aws sts get-caller-identity --profile fintrack-dev` devuelve la cuenta; `terraform -chdir=infra/environments/dev init -backend=false && terraform -chdir=infra/environments/dev validate`.
2. La rama docs/lineamiento-cardea lleva las decisiones de la 002. Ábrele el PR contra main (parada obligatoria antes) con la evidencia del paso 1 en el cuerpo, sin atribución de IA, y pídeme que lo fusione.
3. Ejecuta /speckit-analyze sobre specs/002-infra-dev-aws para comprobar que spec, plan y tasks son coherentes con la constitución. Si encuentra algo, corrígelo y dímelo.
4. Crea la rama infra/dev-base desde main (cuando el PR esté fusionado) y ejecuta /speckit-implement sobre specs/002-infra-dev-aws/tasks.md por fases, empezando por la fase 0 (inventario de ~/py/fintrack y ~/py/cardea). Antes de cada `terraform apply` me enseñas el plan y esperas mi OK; aplica con `-var aws_profile=fintrack-dev`. Replica la forma de los módulos de Fenora y Cardea (naming jano-dev-*, tags, variables, outputs, comentarios de decisión), no su contenido literal, y deja fuera VPC para Lambda, NAT, RDS Proxy, ECR, passkeys e IdP sociales salvo que yo te diga que unifiquemos Aurora con el patrón de Cardea.
5. Al cerrar cada fase: `terraform fmt -recursive`, `terraform validate`, commit en infra/dev-base y parada para el OK. La fase 6 incluye pegar por CLI la política de arranque del rol de apply con el mismo comando que usamos en Cardea; me lo enseñas antes de ejecutarlo.

Pregúntame lo que necesites decidir yo; lo que sea una convención del repo o algo ya resuelto en Cardea, aplícalo sin preguntar.
```

## 5. Después de la 002

- `/speckit-clarify` y `/speckit-plan` sobre `specs/003-api-y-motor` (backend en TypeScript, ADR-001).
- `/speckit-plan` sobre `004-agentes-ia` una vez cotizados los proveedores de datos y verificación.
- `005-canales-microsoft-365` cuando exista el dictamen legal y un tenant de pruebas.
