# Constitución de Jano

<!--
Fuente de verdad: AGENTS.md. Este fichero es la versión que leen los comandos
de Spec Kit (/speckit.specify, /speckit.plan, /speckit.tasks, /speckit.implement).
Si los dos discrepan, manda AGENTS.md y se corrige aquí.
-->

## Principios fundamentales

### I. La IA decide, el motor ejecuta
Toda acción de los agentes (Orquestador, Account Finder, Contact Finder, Outreach, Response) es una **propuesta**. Solo el motor de ejecución envía, reserva, registra o detiene, y solo tras comprobar las reglas fijas. Cada decisión guarda razonamiento, evidencia leída y reglas comprobadas en un registro de eventos append-only. Nada sale con el nombre del cliente sin aprobación humana salvo que el cliente active el piloto automático.

### II. Contract-first, dominio sin infraestructura
`contracts/openapi/jano-api.yaml` y `packages/domain` cambian antes que el código que los usa. El dominio no importa SDK de AWS, HTTP ni base de datos: los proveedores (LLM, datos de empresas, verificación, correo, calendario, CRM) están detrás de puertos. Arquitectura hexagonal; TypeScript `strict` en todo el monorepo.

### III. Misma plataforma que Fenora, sin copiar lo que no aplica
AWS `eu-west-1`, misma cuenta y mismo estado de Terraform que Fenora (`andres-mejia/fintrack`): Amplify Hosting, Cognito, API Gateway HTTP con autorizador JWT, Lambda sin VPC, Aurora Serverless v2 con Data API, S3, Bedrock, SES, DynamoDB. Se replica la forma de los módulos de `fintrack/infra/modules` (naming `jano-<env>-<componente>`, tags, OIDC desde CI, auto-pause de Aurora), no su contenido literal. No se copia Quarkus ni VPC privada: Jano no los necesita en el MVP.

### IV. Cumplimiento dentro del producto
Reglas que la IA no puede saltarse: límite de envíos por buzón y día, nada a emails sin verificar, WhatsApp solo tras respuesta, detener la secuencia al responder, bajas inmediatas a la lista de supresión. Cada dato de contacto guarda origen y base legal. Hasta que exista dictamen legal (LSSI art. 21, RGPD, opt-in de WhatsApp), ningún entorno escribe a contactos reales que no sean de prueba. Datos personales reales nunca en fixtures, capturas ni tests.

### V. Verificación con evidencia
Un criterio se cierra con el comando y su salida, no con prosa. `pnpm type-check`, `pnpm build`, `pnpm test` y `terraform fmt -check`/`validate` en verde antes de un PR. Tests unitarios reales sobre el dominio y el motor, sin mockear el dominio. Las esperas largas van a segundo plano o a CI.

## Normas de trabajo

- Conventional Commits; autor y committer Andrés Mejía; sin atribución de IA ni emojis en commits, PR ni issues (`scripts/check-ai-attribution.sh`).
- Todo entra por PR a `main`. **Parada obligatoria antes de push o PR**: se reportan rama, ficheros, mensaje y validaciones y se espera el OK de Andrés.
- Un cambio de `AGENTS.md`, `CLAUDE.md` o de esta constitución exige OK explícito de Andrés.
- Frontend: solo tokens `--color-jano-*`; Bricolage Grotesque (títulos), Figtree (interfaz), JetBrains Mono (datos); lo que decide la IA lleva el borde `ai-border`.
- Infra: `apply` solo con plan revisado; en producción se pregunta siempre. Coste con cero clientes cercano a cero (Aurora en pausa, on-demand).

## Flujo con Spec Kit

1. `/speckit.specify` crea `specs/NNN-<verbo-objeto>/spec.md` con escenarios, requisitos (FR) y criterios de éxito medibles. Sin decisiones de implementación.
2. `/speckit.clarify` solo si quedan `[NEEDS CLARIFICATION]`; las dudas que puede decidir Andrés en un minuto se le preguntan, no se asumen.
3. `/speckit.plan` fija stack, módulos, contratos y datos, y pasa la **puerta de constitución**: cada principio de arriba con un sí o una justificación.
4. `/speckit.tasks` produce tareas pequeñas, cada una con su comando de verificación.
5. `/speckit.implement` ejecuta por fases; al terminar cada fase: tests, type-check, build, commit en la rama de la feature y parada para el OK.

## Gobierno

Esta constitución manda sobre las specs y los planes. Una spec que la contradiga se corrige, no se implementa. Versión 1.0.0 · ratificada el 2026-10-29 · última revisión el 2026-10-29.
