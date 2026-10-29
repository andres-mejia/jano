# Tareas 008 · Prueba de concepto de punta a punta

Convención: `[Tn] [P?] descripción · verificación`. Cada fase es un PR y deja dev funcionando.

## Fase A · Motor y datos (`feat/poc-motor`)
- [ ] T009 ADR-003 (motor propio sobre Postgres) y `research.md` · revisión en el PR.
- [ ] T010 Contrato: `POST /campaigns/{campaignId}/accounts/candidates` (región o dominios), `GET /opportunities`, `GET /opportunities/export` y la ruta pública `GET /baja/{token}` · el YAML valida.
- [ ] T011 `backend/migrations/002_motor.sql` (FR-001) con RLS forzado y permisos mínimos · batería de aislamiento de 007 ampliada a las tablas nuevas, verde contra Postgres.
- [ ] T012 Puertos `ports/{ia,correo,web,reloj}.ts` y adaptadores `Deterministic*` · tests de los adaptadores.
- [ ] T013 Dominio del motor: transiciones, reglas en orden (FR-003), planificación de pasos con `DEMO_DAY_MINUTES` y cambio de rama (US4b) · tests unitarios sin mocks del dominio, 100 % de transiciones.
- [ ] T014 Casos de uso y rutas: campañas e ICP, candidatas, cuentas (aprobar y descartar), prospects (detalle, eventos, detener, aprobar paso), bandeja (listar, aprobar, descartar, regenerar), dashboard, flujo, auditoría, guardrails, conexiones · tests de integración contra Postgres.
- [ ] T015 Entrypoint `motor.ts` (FR-004) con `FOR UPDATE SKIP LOCKED` e idempotencia · test de doble invocación.
- [ ] T016 Infra: Lambda `jano-dev-motor` y EventBridge Scheduler cada minuto en `infra/modules/backend-api`; rutas reales en API Gateway por delante de las comodín · `plan` revisado y `apply`.

## Fase B · Agentes en Bedrock (`feat/poc-agentes`)
- [ ] T020 `WebReader` (FR-013) con `robots.txt`, límites y extracción de texto · tests con un servidor HTTP local.
- [ ] T020b `OsmCompanySource` y `ManualCompanySource` (FR-013b), consultas troceadas por provincia y caché de 24 h · test con una respuesta de Overpass grabada.
- [ ] T021 `PiiStripper` (FR-014) · tests con NIF, IBAN, teléfonos y emails.
- [ ] T022 Adaptadores `Bedrock*` y prompts versionados (FR-010, FR-011, FR-015) · prueba manual contra Bedrock con 3 webs reales, salida válida.
- [ ] T022b Adaptador Bedrock de `PlanificadorOrquestador` y revisión diaria de campaña (FR-017) · propuesta fuera del menú queda `rejected` y pasa a una persona.
- [ ] T023 Coste, latencia y tope diario (FR-016) · log JSON por llamada.
- [ ] T024 Infra: permiso `bedrock:InvokeModel` sobre el perfil de inferencia para las Lambdas · `plan` y `apply`.

## Fase C · Correo por SES (`feat/poc-correo`)
- [ ] T030 `SesMailSender` con Reply-To por token, pie de baja y `.ics` (FR-020, FR-022, FR-024) · tests del MIME generado.
- [ ] T031 Regla de lista blanca en el motor (FR-021) · test: destinatario fuera de la lista queda `blocked`.
- [ ] T032 Infra de recepción (FR-023): MX de `r.jano.tekhos.com`, verificación del subdominio, bucket o prefijo, regla `jano-dev-respuestas`, Lambda `jano-dev-entrada` · `plan` y `apply`; correo de prueba a un token inexistente no se guarda.
- [ ] T033 Lambda de entrada: correlación por token, texto citado fuera, entrega al motor · tests con correos reales de Gmail anonimizados.

## Fase D · App y cierre (`feat/poc-app`)
- [ ] T040 Campo de webs candidatas en la campaña y acciones persistentes (FR-030, FR-031) · `pnpm build`.
- [ ] T040b Oportunidades y exportación CSV para Excel (FR-031b) · el CSV abre en Excel con tildes.
- [ ] T041 Marca de prueba de concepto y atribución de OpenStreetMap (FR-032) · captura.
- [ ] T042 `demo_data = false` en dev y alta del tenant de prueba · todas las rutas responden desde el backend.
- [ ] T043 Recorrido SC-001 en dev con 50 agencias de viajes reales, una de ellas llevada hasta la reunión; costes en `research.md` (SC-004) · capturas y registro de eventos.
- [ ] T044 Guía `docs/guias/demo-poc.md`: cómo preparar y repetir la demo · revisión en el PR.

## Fase E · Pide algo a Jano (`feat/poc-copiloto`)
- [ ] T050 Contrato `POST /copilot/questions` y esquemas en `@jano/domain` (FR-040) · el YAML valida.
- [ ] T051 Herramientas de solo lectura sobre el tenant y bucle de Converse con uso de herramientas (FR-041) · test: ninguna herramienta escribe; RLS impide leer otro tenant.
- [ ] T052 Citas obligatorias, `copilot_turns` y respuesta «no lo sé» (FR-042) · test con preguntas sin datos.
- [ ] T053 Panel con Ctrl K, preguntas sugeridas por pantalla y enlaces (FR-043) · capturas a 1440 y 390.
- [ ] T054 Guion de 10 preguntas de la demo (SC-006) · respuestas revisadas en `docs/guias/demo-poc.md`.
