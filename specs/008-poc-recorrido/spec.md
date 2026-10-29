# Feature 008 · Prueba de concepto: un recorrido real de punta a punta

**Rama**: una por fase (`feat/poc-motor`, `feat/poc-agentes`, `feat/poc-correo`, `feat/poc-app`) · **Estado**: especificada · **Fecha**: 2026-10-29 · **Depende de**: 007 · **Recorta**: 003, 004 y 005

## Objetivo
Demostrar Jano funcionando de verdad en dev: de una frase a una reunión, con IA real (Bedrock), un motor que decide qué sale, aprobación humana, correo que sale y respuestas que entran. Es el subconjunto de 003, 004 y 005 que hace falta para ese recorrido; lo que queda fuera sigue en sus specs.

Es el paso 4 del borrador de producto (`docs/producto/`, página 18): «Prototipo con 50 agencias de viajes, de principio a fin, con correos reales y aprobación humana». Mientras no haya dictamen legal, los correos reales van solo a la lista blanca.

Decisiones de Andrés (2026-10-29):
- **Canal**: SES con `tekhos.com` para la prueba de concepto. Microsoft 365 (005) llega después detrás del mismo puerto de correo.
- **Empresas**: webs públicas reales. Las candidatas salen de OpenStreetMap (`shop=travel_agency` con `website`, ODbL, gratis), filtradas por la región del ICP; la persona puede añadir dominios a mano. El Account Finder lee la web de cada una.
- **Lista blanca** de destinatarios en dev: `ramejiafernandez@gmail.com` y `amilest7777@gmail.com`, admitiendo alias con `+` (`ramejiafernandez+albufera@gmail.com`).

## El recorrido (lo que se demuestra)
1. La persona crea una campaña con una frase; el Orquestador (Bedrock) la convierte en ICP y lo afina por turnos.
2. El Account Finder trae hasta 50 agencias candidatas de la región (OpenStreetMap, o dominios que pegue la persona), lee la web de cada una, puntúa el encaje 0-100, razona, cita la evidencia con su URL y detecta señales de compra (vacante comercial, oficina nueva, web renovada) cuando la web las muestra con fecha.
3. La persona aprueba cuentas. El Contact Finder propone a quién escribir (cargo y por qué) a partir de la web.
4. Como la verificación de email aún no tiene proveedor, el destinatario de la prueba de concepto es una dirección de la lista blanca con un alias por cuenta; la app lo dice en pantalla.
5. Outreach elige la secuencia (consultiva o por señal) y redacta cada paso. El motor comprueba las reglas y deja cada paso en la bandeja de aprobación. Si aparece una señal a mitad de la consultiva, Outreach propone cambiar de rama con razonamiento y evidencia; la persona lo aprueba.
6. La persona aprueba y el correo sale por SES. La persona responde desde Gmail; la respuesta entra sola y detiene la secuencia.
7. Response clasifica la intención, redacta la contestación con dos huecos y la deja en la bandeja. Al aprobar, sale la contestación con una invitación de calendario (`.ics`), se crea la oportunidad y el prospect pasa a `meeting`.
8. En cualquier pantalla, «Pide algo a Jano» (Ctrl K) responde preguntas sobre la campaña citando el registro: «¿por qué se descartó Travesía?», «¿qué tengo pendiente de Valencia?».
9. Centro de mando, campañas, prospects, flujo, bandeja y auditoría muestran ese recorrido, calculado del registro de eventos. Las oportunidades se exportan a Excel (CSV).

## Escenarios de usuario

### US1 · Campaña e ICP con IA real (P1)
**Aceptación**: `POST /campaigns` con una frase devuelve una campaña con ICP válido contra `IcpSchema`; una corrección por turno cambia solo lo pedido y queda en `icp_turns`.

### US2 · Cuentas reales puntuadas con evidencia (P1)
**Aceptación**: una campaña de agencias de viajes de una región trae entre 30 y 50 candidatas de OpenStreetMap con su fuente; cada cuenta lleva fit, razonamiento y al menos una evidencia con URL de la web leída y fecha; una web que no responde o prohíbe el rastreo en `robots.txt` queda `discarded` con el motivo, sin fit inventado. La facturación queda vacía con «sin dato registral» hasta tener proveedor: no se estima.

### US3 · Prospect en secuencia y primer correo aprobado (P1)
**Aceptación**: al aprobar una cuenta se crea el prospect con contacto propuesto y destinatario de la lista blanca; el paso queda en `awaiting_approval`; al aprobarlo, el motor registra las reglas comprobadas, envía y guarda el `Message-ID`.

### US4 · La respuesta entra y deja un borrador listo (P1)
**Aceptación**: una respuesta desde Gmail aparece en la bandeja en menos de 2 minutos con intención, razonamiento y borrador; la secuencia queda detenida en la misma transacción; una baja pasa a supresión sin esperar aprobación.

### US4b · La secuencia cambia de rama (P2)
**Aceptación**: con una señal detectada después del primer envío (relectura semanal de la web, o una señal añadida a mano en la demo), Outreach propone pasar a la secuencia por señal; al aprobarlo, los pasos pendientes de la consultiva pasan a `skipped`, se planifican los nuevos y el recorrido del prospect lo muestra como en la pantalla de referencia.

### US5 · Reunión agendada (P1)
**Aceptación**: aprobar un borrador con huecos envía la contestación con un `.ics` del hueco elegido, registra `meeting_booked`, crea la oportunidad (`opportunities`) y el prospect pasa a `meeting`; `GET /opportunities/export` devuelve un CSV que abre Excel.

### US6 · La app sin datos de ejemplo (P1)
**Aceptación**: con el tenant de prueba, todas las rutas del contrato las sirve el backend real; `demo_data` pasa a `false` en dev y la app no cambia de forma.

### US7 · Pide algo a Jano (P2)
La barra «Pide algo a Jano» de las pantallas de referencia deja de ser decorativa: la persona pregunta en lenguaje natural sobre sus datos y Jano responde citando de dónde lo saca.
**Aceptación**: «¿por qué se descartó X?» devuelve el motivo con enlace al evento; «¿qué tengo pendiente?» lista los elementos de la bandeja con enlace; una pregunta sobre otro tenant o sin datos responde que no lo sabe; «aprueba el borrador de X» no aprueba nada y lleva a la pantalla de aprobación.

## Requisitos funcionales

### Motor y datos
- **FR-001** Migración `002_motor.sql` con `campaigns`, `icp_turns`, `accounts`, `contacts`, `prospects`, `sequence_steps`, `prospect_events` (append-only), `inbox_items`, `opportunities`, `suppression_list` y `guardrails`, todas con `tenant_id`, RLS forzado como en 007 y permisos de `jano_api` mínimos (sin `UPDATE` ni `DELETE` en `prospect_events`).
- **FR-002** Máquina de estados de `@jano/domain` (`PROSPECT_TRANSITIONS`); una transición no permitida es 409 y un evento `rejected`.
- **FR-003** Reglas en este orden, registradas pasen o no: supresión, respuesta previa, destinatario en lista blanca (solo dev), email verificado o de lista blanca, límite diario por buzón (por defecto 50; se reinicia a las 00:00 Europe/Madrid).
- **FR-004** Motor propio sobre Postgres (ADR-003). Lambda `jano-dev-motor` invocada por EventBridge Scheduler cada minuto; toma pasos vencidos con `FOR UPDATE SKIP LOCKED` en lotes de 50 y es idempotente. Variable `DEMO_DAY_MINUTES` (por defecto 1440): en la demo un «día» de secuencia puede durar minutos.
- **FR-005** Aprobaciones (`/prospects/{id}/steps/{stepId}/approve`, `/inbox/{id}/approve`) ejecutan sus efectos en una transacción; si el envío falla, no queda nada a medias y el paso pasa a `blocked` con el error.
- **FR-006** Dashboard, flujo y auditoría son consultas sobre `prospect_events`; ninguna tabla de contadores aparte.

### Agentes (Bedrock)
- **FR-010** Puertos `IcpStructurer`, `AccountScorer`, `ContactResolver`, `DraftWriter` y `ReplyClassifier` con dos adaptadores: `Bedrock*` (Converse API, perfil `eu.anthropic.claude-sonnet-4-6` por defecto, variable `BEDROCK_MODEL_ID`) y `Deterministic*` para tests y CI.
- **FR-011** Prompts versionados en `backend/src/adapters/bedrock/prompts/*.md`; salida JSON validada con zod; un reintento ante JSON inválido y después fallo registrado.
- **FR-012** El modelo no tiene herramientas: no envía, no reserva, no escribe. Propone; el motor ejecuta.
- **FR-013** Lector web `WebReader` con `fetch` de Node 22, `robots-parser` y `@mozilla/readability` sobre `linkedom`: solo `https`, respeta `robots.txt` con agente `JanoBot`, lee portada y hasta 3 páginas internas («quiénes somos», «empleo», «noticias»), 10 s y 512 KB por página, texto principal sin HTML. Lo que lee se guarda como evidencia con URL y fecha.
- **FR-013b** Fuente de candidatas `CompanySource` con adaptador `OsmCompanySource` (Overpass API, `shop=travel_agency` y `office=travel_agent` con `website`, por región del ICP; se descartan las de cadena con etiqueta `brand`), y `ManualCompanySource` para dominios pegados. Cada cuenta guarda su origen (`osm:<tipo>/<id>` o `manual`) y la atribución ODbL se muestra en la app.
- **FR-014** `PiiStripper` antes de cada llamada al modelo: teléfonos, emails, NIF/DNI e IBAN se sustituyen por marcadores.
- **FR-015** Sin datos personales de terceros reales: el Contact Finder devuelve un cargo y el motivo, nunca nombre ni email de una persona real de la web; el contacto se guarda como «Cargo (prueba)» con el destinatario de la lista blanca.
- **FR-017** Orquestador con IA (ADR-002, capa de planificación): en cada punto de decisión (cuenta aprobada, paso vencido, respuesta clasificada, señal nueva) el puerto `PlanificadorOrquestador` propone **una** acción de un menú cerrado derivado del estado del prospect (`planificar_secuencia`, `cambiar_rama`, `esperar_hasta`, `pedir_borrador`, `detener`, `escalar_a_humano`, `descartar`) con razonamiento y evidencia. El motor la valida contra las transiciones y las reglas; si no cabe, la rechaza, lo registra y la pasa a una persona. Una vez al día revisa la campaña y deja la «Lectura de Jano» (cuello de botella y prioridad) en el centro de mando.
- **FR-016** Coste y latencia por llamada en logs JSON con `tenant_id` y agente; tope diario de 500 llamadas por tenant.

### Correo (SES)
- **FR-020** Puerto `MailSender` con adaptador `SesMailSender` (SES v2, eu-west-1, configuration set `jano-dev`). Remitente `Jano <jano@tekhos.com>` y `Reply-To: <token>@r.jano.tekhos.com`, con un token opaco por prospect.
- **FR-021** Lista blanca obligatoria fuera de producción: si el destinatario no está en `MAIL_ALLOWLIST` (con alias `+`), el motor no envía y registra `blocked`. Es una regla del motor, no del adaptador.
- **FR-022** Pie de cada correo con enlace de baja (`/baja/<token>` en la API, sin JWT) que añade a supresión.
- **FR-020b** Correo saliente compuesto con `MailComposer` de Nodemailer y enviado con SES v2 `SendEmail` en modo `Raw`, para poder adjuntar el `.ics`.
- **FR-023** Recepción: MX de `r.jano.tekhos.com` a SES eu-west-1; regla `jano-dev-respuestas` en el conjunto activo de la región que guarda el correo en S3 (`jano-dev-assets/inbound/`, cifrado, 30 días) e invoca la Lambda `jano-dev-entrada`. La Lambda parsea con `mailparser`, correlaciona por token (y `In-Reply-To` como respaldo), descarta lo que no correlaciona sin guardarlo, quita el texto citado y la firma con `email-reply-parser` y entrega la respuesta al motor.
- **FR-024** Reunión: huecos de la disponibilidad configurada del tenant (laborables 9-14 y 16-18 Europe/Madrid, 30 min, a partir de 48 h); al aprobar se adjunta un `.ics` (`METHOD:REQUEST`). Sin calendario real hasta 005.

### App
- **FR-030** El contrato gana `POST /campaigns/{campaignId}/accounts/candidates` (región del ICP para OpenStreetMap, o lista de dominios) antes del código. La pantalla de campaña tiene el botón para buscar en la región y el campo para pegar dominios.
- **FR-031** Las acciones que hoy no persisten (aprobar cuentas, aprobar paso, aprobar o descartar borrador, detener secuencia) llaman a la API y se ven reflejadas al recargar.
- **FR-031b** Oportunidades: lista en el centro de mando y `GET /opportunities/export` (CSV con separador `;` y BOM UTF-8 para Excel en español).
- **FR-032** Una marca visible «Prueba de concepto: destinatarios de prueba» en prospects y bandeja mientras el destinatario sea de la lista blanca.

### Pide algo a Jano
- **FR-040** Contrato: `POST /copilot/questions` (`{ question, context?: { screen, entityId } }`) devuelve `{ answer, citations: [{ kind: event|prospect|account|inbox, id, label, href }] }`; antes del código.
- **FR-041** El modelo solo tiene herramientas de lectura sobre los datos del tenant, con RLS como cualquier petición: buscar cuenta o prospect por nombre, eventos de un prospect, resumen y flujo de la campaña, bandeja pendiente y auditoría por regla. Ninguna herramienta escribe; una petición de acción devuelve el enlace a la pantalla donde se aprueba.
- **FR-042** Cada afirmación de la respuesta con datos lleva cita; sin datos que lo respalden, responde que no lo sabe. Pregunta y respuesta quedan en `copilot_turns` (append-only) con las herramientas usadas.
- **FR-043** Interfaz: la barra existente abre un panel con Ctrl K o al pulsarla, con preguntas sugeridas según la pantalla y respuestas con enlaces; el contexto de la pantalla (campaña o prospect abierto) viaja con la pregunta.
- **FR-044** Mismo `PiiStripper`, tope diario y registro de coste que los agentes (FR-014, FR-016).

## Criterios de éxito
- **SC-001** El recorrido 1-8 completo en dev con una empresa real y un Gmail de la lista blanca, sin tocar la base de datos a mano.
- **SC-002** Cero envíos fuera de la lista blanca: comprobable en `prospect_events` y en las métricas de SES.
- **SC-003** Respuesta en la bandeja en menos de 2 minutos desde que se envía desde Gmail.
- **SC-004** Coste medio por cuenta analizada y por prospect anotado en `research.md`.
- **SC-005** Tests del motor y de las reglas contra Postgres real; agentes con adaptador determinista en CI.
- **SC-006** «Pide algo a Jano» responde con cita a 10 preguntas de un guion de demo sobre el recorrido real, sin una sola afirmación sin respaldo.

## Dependencias elegidas
Investigadas el 2026-10-29 frente a alternativas open source (Firecrawl, Crawlee, Temporal, Inngest, LangGraph.js, Mastra, Reacher, AgentSDR, Twenty); el motivo de cada descarte está en `research.md`.
- Converse API de Bedrock directa (`@aws-sdk/client-bedrock-runtime`) con zod, sin framework de agentes: los frameworks están hechos para que el modelo use herramientas, y aquí el modelo solo propone (FR-012).
- `robots-parser`, `@mozilla/readability`, `linkedom`, `mailparser`, `email-reply-parser`, `nodemailer` (solo `MailComposer`). Licencias permisivas, comprobadas en su `LICENSE` antes de añadirlas.

## Fuera de alcance
Microsoft 365 y calendario real (005), datos registrales de facturación y CNAE (requieren proveedor de pago; BORME y OpenMercantil quedan como señales para después), verificación de email (el sondeo SMTP desde AWS no es viable: el puerto 25 está bloqueado), WhatsApp, evaluaciones de 50 casos por agente (004 FR-005), piloto automático.

## Riesgos y decisiones
- **Conjunto de reglas de recepción compartido**: en eu-west-1 el activo es `fenora-dev-rules`. Jano añade su propia regla para su subdominio y no toca las de Fenora; si Fenora cambia de conjunto activo, la regla de Jano hay que moverla.
- **El diferencial del pitch queda a medias**: «datos registrales españoles, facturación y sector reales» no se demuestra sin proveedor de pago. La prueba de concepto lo dice en pantalla en lugar de estimarlo.
- **Webs reales**: se leen solo páginas públicas, respetando `robots.txt`, y se guarda la evidencia citada. No se guardan datos de personas.
- **Legal**: sigue sin dictamen; por eso la lista blanca es una regla del motor y no una opción de la interfaz.
