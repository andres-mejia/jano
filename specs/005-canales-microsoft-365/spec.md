# Feature 005 · Canal de correo con Microsoft 365 y calendario

**Rama**: `feat/canal-m365` · **Estado**: especificada · **Depende de**: 003

## Objetivo
Que los correos salgan desde el buzón del cliente en Microsoft 365, que las respuestas entren solas, que los huecos de reunión salgan de su calendario y que la entregabilidad esté vigilada. Es el único canal del MVP.

## Escenarios de usuario

### US1 · El cliente conecta su buzón (P1)
Desde Conexiones, autoriza a Jano con OAuth de Microsoft (permisos delegados `Mail.Send`, `Mail.Read`, `Calendars.ReadWrite`, `offline_access`). Jano guarda el refresh token en Secrets Manager y muestra el buzón conectado.
**Aceptación**: el token nunca llega al frontend ni al modelo; revocar la conexión borra el secreto y detiene todas las secuencias del buzón.

### US2 · Los envíos salen por Graph y respetan el límite diario (P1)
**Aceptación**: cada envío registra el `internetMessageId`; el contador diario por buzón vive en el motor y se reinicia a las 00:00 Europe/Madrid; un fallo de Graph marca el paso `blocked` con el error y lo reintenta una vez pasada una hora.

### US3 · Las respuestas entran solas (P1)
Suscripción de Graph (webhook) a la carpeta de entrada del buzón, con renovación automática antes de caducar, y un barrido cada 10 minutos como red. Se correlaciona por `conversationId` e `In-Reply-To` con el mensaje enviado.
**Aceptación**: una respuesta aparece en la bandeja en menos de 2 minutos; un correo no relacionado con ningún envío se ignora y no se almacena.

### US4 · Huecos reales y reserva al aprobar (P2)
Response pide al puerto de calendario huecos libres de 30 min en horario laboral del cliente; al aprobar, el motor crea las reservas provisionales y, al confirmar el contacto, el evento definitivo con enlace de videollamada.

### US5 · Entregabilidad vigilada (P2)
Cumplimiento muestra SPF, DKIM y DMARC del dominio de envío (consulta DNS), el día de calentamiento, la tasa de rebote y las quejas.
**Aceptación**: con DMARC ausente, el motor no envía y lo explica; el calentamiento sube el límite diario de 10 a 50 en 21 días.

## Requisitos funcionales
- **FR-001** Adaptadores `GraphMailAdapter`, `GraphCalendarAdapter` y `GraphInboxSubscription` sobre Microsoft Graph v1.0; cliente HTTP propio con reintentos y respeto de `Retry-After`.
- **FR-002** App registrada en Entra ID (multi-tenant, permisos delegados); `client_id` y `client_secret` en Secrets Manager; `redirect_uri` en la app (`/conexiones/microsoft/callback`).
- **FR-003** Webhook de Graph expuesto en API Gateway sin autorizador JWT pero con validación de `clientState` y del `validationToken`; cuerpo máximo 64 KB.
- **FR-004** Dominio de envío secundario por cliente (recomendado) o el principal (con aviso); registros DNS guiados en Conexiones.
- **FR-005** Lista de supresión por tenant consultada antes de cada envío; una baja por respuesta o por enlace de baja en el pie del correo (obligatorio en cada mensaje).
- **FR-006** Correos de prueba: en dev solo se envía a dominios de una lista blanca (`*.example` y los buzones de Andrés y Paco).

## Criterios de éxito
- **SC-001** Un recorrido completo en dev: conectar buzón → secuencia de 2 pasos → respuesta real → bandeja → aprobar → correo enviado y reserva en calendario.
- **SC-002** Cero correos a dominios fuera de la lista blanca en dev (comprobable en el registro).

## Fuera de alcance
Gmail/Google Workspace, WhatsApp (API oficial, tras dictamen legal), llamadas, LinkedIn.

## Dudas abiertas
- **[NEEDS CLARIFICATION]** Dictamen legal sobre LSSI art. 21: condiciona el texto del primer correo y si hace falta relación previa.
- **[NEEDS CLARIFICATION]** Tenant de Microsoft 365 de pruebas (¿el de Fenora, uno nuevo de desarrollador?).
