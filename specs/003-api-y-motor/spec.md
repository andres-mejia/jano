# Feature 003 · API y motor de ejecución

**Rama**: `feat/api-motor` · **Estado**: especificada · **Depende de**: 002

## Objetivo
*Nota (2026-10-29)*: la spec 007 ya creó el paquete `backend/` (hexagonal, adaptadores Data API y pg), las migraciones numeradas con `migrar.ts`, el rol `jano_api` con RLS forzado por `tenant_id`, la Lambda `jano-dev-api` (módulo `backend-api`) y las tablas `tenants`, `tenant_users` y `user_activity`. Esta spec parte de ahí: FR-001 añade la Lambda del motor, FR-002 sigue el mismo patrón de RLS y FR-003 añade migraciones a partir de la 002.

Un backend que sirva el contrato `jano-api.yaml` sobre Aurora, con el motor de ejecución como núcleo: máquina de estados por prospect, registro de eventos append-only, reglas fijas, planificación de pasos y aprobaciones humanas. Sin agentes todavía: donde la IA decide, el motor expone un puerto que 004 implementa; mientras tanto, un adaptador determinista de pruebas.

## Escenarios de usuario

### US1 · La app deja de usar mocks (P1)
Con `NEXT_PUBLIC_AUTH_MODE=cognito`, todas las pantallas leen datos reales del tenant del usuario y las acciones (aprobar cuentas, aprobar borrador, detener secuencia, cambiar reglas) persisten.

### US2 · Un paso programado se ejecuta cuando toca y solo si las reglas lo permiten (P1)
Dado un prospect en secuencia con `nextActionAt` vencido, el motor comprueba límite diario, verificación, supresión y respuesta previa; envía (por el puerto de correo), registra el evento con las reglas comprobadas y programa el siguiente paso. Si una regla falla, registra `blocked` o `deferred` y no envía.

### US3 · Una respuesta detiene la secuencia y crea un elemento de bandeja (P1)
Dada una respuesta entrante (por el puerto de correo), el motor cancela los pasos pendientes, registra `replied`, pide clasificación y borrador al puerto de IA y crea el `InboxItem` en `pending_approval`. Una baja (`opt_out`) pasa a supresión sin esperar aprobación.

### US4 · Todo lo que pasa se puede auditar (P2)
Cada evento lleva agente, tipo, resumen, razonamiento, evidencia, reglas comprobadas y mensaje enviado; `GET /compliance/audit` y el mapa de flujo son proyecciones del mismo registro.

## Requisitos funcionales
- **FR-001** Implementación en TypeScript (Node 22) como monolito modular hexagonal en `backend/`: `domain` (reusa `@jano/domain`), `application` (casos de uso), `ports` (LLM, correo, calendario, datos de empresas, verificación, CRM, reloj, ids), `adapters` (Aurora Data API, API Gateway, Bedrock, Graph, …). Una Lambda `jano-dev-api` para la API y una Lambda `jano-dev-motor` para el scheduler; mismo código, dos entrypoints.
- **FR-002** Multi-tenant por columna `tenant_id` en todas las tablas y en toda consulta; el `tenant_id` sale del claim del JWT, nunca del cuerpo.
- **FR-003** Esquema PostgreSQL versionado con migraciones (node-pg-migrate o SQL numerado aplicado por un job de CI, nunca en el arranque de una Lambda).
- **FR-004** Máquina de estados de prospect igual a `PROSPECT_TRANSITIONS` del dominio; una transición no permitida es un error 409 y un evento `rejected`.
- **FR-005** Registro de eventos append-only (`prospect_events`), sin UPDATE ni DELETE; las vistas (`dashboard`, `flow`, `audit`) se calculan con SQL sobre él.
- **FR-006** Scheduler: EventBridge Scheduler invoca el motor cada minuto; el motor toma los prospects con `next_action_at <= now()` con `SELECT … FOR UPDATE SKIP LOCKED` y procesa por lotes de 50. Idempotente ante reinvocaciones.
- **FR-007** Reglas fijas evaluadas en el motor, en este orden: supresión, respuesta previa, email verificado, límite diario por buzón, canal permitido. Cada evaluación se registra, pase o no.
- **FR-008** Aprobaciones: `POST /inbox/{id}/approve` y `POST /prospects/{id}/steps/{stepId}/approve` ejecutan los efectos declarados en `effects` en una transacción; si un efecto falla, no se envía nada.
- **FR-009** Puertos de IA (`IcpStructurer`, `AccountScorer`, `ContactResolver`, `SequencePlanner`, `ReplyClassifier`, `DraftWriter`) con un adaptador `Deterministic*` para tests y entornos sin Bedrock.
- **FR-010** Errores como `Problem` (`title`, `status`, `detail`); nunca trazas al cliente. Logs JSON con `tenant_id`, `request_id` y `prospect_id`.
- **FR-011** Tests: unitarios del motor y de las reglas sin mocks del dominio; de integración contra Postgres local (docker-compose) para repositorios y migraciones; contrato validado con el OpenAPI (p. ej. `openapi-backend` o validación con zod generada).

## Entidades clave
Tablas: `tenants`, `campaigns`, `icp_turns`, `accounts`, `account_evidence`, `contacts`, `prospects`, `sequences`, `sequence_steps`, `prospect_events`, `inbox_items`, `drafts`, `guardrails`, `suppression_list`, `mailboxes`, `connections`, `audit` (vista).

## Criterios de éxito
- **SC-001** La app con `cognito` pasa el mismo recorrido que en mock sin tocar el frontend.
- **SC-002** 100 % de las transiciones de estado cubiertas por tests; ninguna ruta del contrato sin handler.
- **SC-003** Un paso vencido se procesa en menos de 90 s desde `nextActionAt`.
- **SC-004** Una respuesta entrante crea el `InboxItem` y cancela los pasos pendientes en la misma transacción.

## Fuera de alcance
Prompts y adaptadores Bedrock (004), conexión real a Microsoft 365 (005), exportación a CRM.

## Decisiones tomadas
- Lenguaje del backend: **TypeScript (Node 22)**, decidido por Andrés el 2026-10-29 (ADR-001). Alternativas y motivos en el ADR.
