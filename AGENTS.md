# Jano — constitución

Normas transversales del repo, neutras respecto a la herramienta. Manda sobre cualquier adaptador (`CLAUDE.md`, `.claude/`, `.github/`).

## 1. Qué es Jano y mapa del monorepo

Equipo comercial de IA para pymes B2B españolas: encuentra cuentas, localiza al contacto, escribe en el momento oportuno y agenda la reunión. La IA decide; un motor con reglas ejecuta; la persona aprueba lo que sale con su nombre. Producto en borrador (`docs/producto/`).

Un solo repo, una sola rama viva (`main`), un solo desarrollador (Andrés Mejía) y un socio (Paco) que revisa producto.

```
frontend/jano-web        Astro 5 + Tailwind 4 — landing, apex jano.* (estático)
frontend/jano-app        Next.js 16 · React 19 · Tailwind 4 — la app, app.jano.*
packages/domain          tipos y esquemas del dominio compartidos (TypeScript + zod)
contracts/openapi        contrato de la API (contract-first)
infra/environments/dev   Terraform plano, backend S3, eu-west-1
infra/modules/*          módulos propios (cognito, hosting, waitlist, aurora, assets, api)
docs/ADR                 decisiones; docs/producto: pitch y pantallas; docs/guias: runbooks
```

Amplify despliega las dos apps de este repo desde `main`.

## 2. Jerarquía de verdad

**`AGENTS.md` > `docs/ADR/` > `contracts/` > código.** Uno de rango inferior no contradice a uno superior: lo corrige el PR que lo detecte.

- El estado del trabajo vive en GitHub (issues, PR, etiquetas), no en ficheros del repo.
- Los adaptadores de cada herramienta dicen cómo se ejecuta aquí; no añaden normas.

## 3. Producto congelado

Extracto del borrador de producto (`docs/producto/jano-borrador-de-producto.pdf`); no se re-litiga durante la implementación.

- Cinco agentes: Orquestador, Account Finder, Contact Finder, Outreach, Response. La IA propone acciones; **el motor de ejecución decide si se ejecutan** y lo registra todo (ADR-002).
- Reglas que la IA no puede saltarse: límite de envíos por buzón y día, no enviar a emails sin verificar, WhatsApp solo tras una respuesta, detener la secuencia al recibir respuesta, lista de supresión y bajas inmediatas.
- Autonomía graduable por cliente. **Por defecto, la persona aprueba cada mensaje.** El piloto automático es opt-in.
- Cada decisión de la IA guarda razonamiento, evidencia leída y reglas comprobadas. Cada dato de contacto guarda su origen.
- MVP: email con Microsoft 365. WhatsApp, llamadas y LinkedIn automatizado quedan fuera.
- Datos solo en AWS `eu-west-1`. LLM: Bedrock. El modelo nunca ve credenciales de terceros.
- **Pendiente de dictamen legal** (LSSI art. 21, RGPD, opt-in de WhatsApp): hasta que exista, ningún entorno envía correos a contactos reales que no sean de prueba.

## 4. Arquitectura

- Serverless en AWS, misma forma que Fenora: Amplify Hosting para las dos apps, Cognito para auth, API Gateway HTTP API con autorizador JWT, Lambdas sin VPC, Aurora Serverless v2 con Data API, S3 para evidencias y adjuntos, Bedrock para el LLM.
- Hexagonal: el dominio (`packages/domain` y, cuando exista, el backend) no conoce infraestructura. El LLM está detrás de un puerto; los proveedores de datos, verificación, correo y calendario también.
- Contract-first: `contracts/openapi/jano-api.yaml` cambia antes que el código que lo usa. El frontend consume solo lo que el contrato declara.
- Multi-tenant: un `tenant_id` por cliente en cada tabla y en cada clave de S3; el JWT lo lleva como claim. Nunca se deduce del cuerpo de una petición.
- Secrets en Secrets Manager. Las credenciales de Microsoft 365 y de proveedores de datos nunca pasan por el frontend ni por el modelo.
- Estado por prospect como máquina de estados explícita; el registro de eventos es append-only y alimenta el mapa de flujo y la auditoría.

## 5. Código

- TypeScript `strict` en todo el monorepo. Tipado fuerte, inmutabilidad, fallo temprano (zod en los bordes).
- Frontend: solo tokens `--color-jano-*` (tinta, cobalto, bronce, niebla); nunca colores sueltos. Tipografía: Bricolage Grotesque (títulos), Figtree (interfaz), JetBrains Mono (datos). Cifras con `tabular-nums`.
- Todo lo que decide la IA se marca en la interfaz con el borde `ai` y se puede abrir para ver por qué.
- Nada de datos personales reales en fixtures, capturas ni tests: empresas y personas inventadas con dominios `.example`.

## 6. Git y PR

- Conventional Commits. **Autor y committer son Andrés Mejía**, nunca una identidad de IA. Sin atribución de IA en commits, PR, issues ni comentarios (`scripts/check-ai-attribution.sh` lo hace cumplir). Sin emojis en los mensajes.
- Cuerpo multilínea: qué cambia, por qué, y los issues que toca.
- Todo entra por PR; `main` no admite push directo.
- **Parada obligatoria antes de push o PR**: rama, ficheros, mensaje y validaciones, y se espera el OK de Andrés. Si algo falla, se para y se reporta; no se stashea ni se descarta nada.

## 7. Verificación

- Un criterio no se cierra por autodeclaración: la evidencia es el comando y su salida.
- `pnpm type-check` y `pnpm build` en verde antes de abrir un PR; `terraform fmt -check` en `infra/`.
- Tests unitarios reales: no se mockea el dominio.
- Las esperas largas (builds, baterías) van en segundo plano o en CI, no turno a turno.

## 8. Infra y entornos

- `dev` es el único entorno hasta que haya clientes piloto. `apply` solo con plan revisado; en producción se pregunta siempre.
- Credenciales AWS temporales por OIDC desde CI; en local, perfil SSO.
- Coste objetivo con cero clientes: el de Aurora en pausa, Amplify y DynamoDB on-demand, es decir, cerca de cero.
