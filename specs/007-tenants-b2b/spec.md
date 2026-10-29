# Feature 007 · Tenants y alta B2B

**Rama**: `feat/tenants-b2b` · **Estado**: especificada · **Fecha**: 2026-10-29 · **Depende de**: 002, 006

## Objetivo
Que cada empresa cliente exista en Jano como tenant con sus datos y sus usuarios, y que su responsable pueda gestionar quién de su equipo entra, sin registro abierto y sin que un tenant pueda ver nunca los datos de otro. Hoy el tenant es solo una etiqueta que el administrador escribe a mano en cada usuario; tras esta feature es un registro con nombre, plan y estado, el alta de usuarios se hace desde la app y el aislamiento entre tenants lo garantiza también la base de datos.

Jano sigue siendo B2B (decisión de Andrés, 2026-10-29): un tenant es una empresa con varios usuarios, no un tenant por persona como Fenora.

## Escenarios de usuario

### US1 · El equipo de Jano da de alta una empresa cliente (P1)
**Por qué**: sin esto no hay forma repetible de incorporar un cliente piloto; hoy son comandos sueltos y el tenant no existe como dato.
**Prueba independiente**: ejecutar el alta de una empresa inventada y comprobar que su owner entra en la app y ve su empresa.
**Aceptación**
1. Dado el nombre de una empresa y el email de su responsable, cuando el equipo de Jano ejecuta el alta, queda creado el tenant (nombre, plan, estado activo) y su primer usuario con rol owner, que recibe un correo para entrar.
2. Si el email ya pertenece a un usuario de Jano, el alta se detiene sin crear nada y lo explica.
3. El owner, al entrar, ve el nombre de su empresa en la app.
4. Los usuarios que ya existen (piloto y Andrés en `tenant-rumbonorte`) quedan asociados a un tenant real sin volver a darlos de alta.

### US2 · El owner invita a un compañero (P1)
**Por qué**: un cliente B2B tiene varios comerciales; sin invitación cada alta vuelve a depender del equipo de Jano.
**Prueba independiente**: un owner invita a un email nuevo; ese email entra y ve los datos del mismo tenant.
**Aceptación**
1. Dado un owner, cuando invita a `x@empresa` como member, `x` recibe un correo de invitación y, al entrar, pertenece al tenant del owner con rol member.
2. Si `x` usa Google con ese mismo email, entra con Google sin necesitar la contraseña del correo (spec 006).
3. La lista de usuarios del tenant muestra a `x` como invitado hasta su primer acceso y como activo después.
4. Un member no ve la opción de invitar y, si lo intenta igualmente, se le deniega.
5. Invitar a un email que ya es usuario de Jano (de este u otro tenant) se rechaza con un mensaje claro y no revela a qué tenant pertenece.

### US3 · El owner desactiva a un member (P1)
**Por qué**: cuando un comercial deja la empresa, su acceso a los datos del cliente debe cortarse en el acto.
**Prueba independiente**: desactivar a un member con sesión abierta y comprobar que su siguiente acción se rechaza.
**Aceptación**
1. Dado un member activo, cuando el owner lo desactiva, el member no puede volver a entrar y su sesión abierta deja de funcionar en su siguiente petición.
2. El owner puede reactivarlo, y vuelve a entrar con los mismos datos.
3. Un owner no puede desactivarse a sí mismo ni desactivar a otro owner desde la app.

### US4 · Un tenant nunca ve datos de otro (P1)
**Por qué**: es la promesa básica de un SaaS multi-tenant; un fallo aquí es una fuga de datos de clientes.
**Prueba independiente**: con dos tenants con datos, cualquier lectura o escritura de uno devuelve cero filas del otro, también si el código de la consulta olvida filtrar.
**Aceptación**
1. Dados los tenants A y B con datos, un usuario de A no obtiene ningún dato de B por ninguna vía de la app ni de la API.
2. Aunque una consulta del backend omita el filtro por tenant, la base de datos solo devuelve filas del tenant de la petición.
3. Una petición sin tenant identificable no lee ni escribe datos de negocio.

### US5 · Un tenant suspendido no entra (P2)
**Aceptación**
1. Dado un tenant suspendido por el equipo de Jano, ninguno de sus usuarios puede entrar ni usar la API; al reactivarlo vuelven a entrar con sus datos intactos.

## Casos límite
- El email invitado llega con mayúsculas distintas: se trata como el mismo email.
- El invitado no abre el correo en el plazo de validez: el owner puede reenviar la invitación.
- El último owner de un tenant no puede quedar desactivado: siempre queda al menos un owner activo.
- Un usuario desactivado intenta entrar con Google: se rechaza igual que con contraseña.
- Dos owners invitan al mismo email a la vez: solo una invitación prospera.
- La base de datos está en pausa al entrar: el acceso tarda más pero no falla.

## Requisitos funcionales
- **FR-001** Un tenant es una empresa cliente con identificador estable, nombre, plan (texto, sin facturación) y estado (activo o suspendido). Existe como dato en la base de datos de Jano.
- **FR-002** Cada usuario pertenece a un solo tenant y tiene rol owner o member. La pertenencia y el rol solo los escribe el sistema (alta, invitación), nunca el propio usuario.
- **FR-003** El alta de una empresa y de su primer owner es una operación del equipo de Jano, repetible y documentada; no existe registro abierto (specs 002 y 006).
- **FR-004** Solo un owner puede invitar, listar, desactivar y reactivar usuarios, y solo de su tenant.
- **FR-005** La invitación envía un correo al invitado para su primer acceso. Son correos a usuarios de la app, no a contactos de prospección: no les afecta la restricción de AGENTS.md §3, y en dev solo se invita a cuentas de prueba o del equipo.
- **FR-006** Un usuario desactivado o de un tenant suspendido pierde el acceso desde su siguiente petición, entre por donde entre.
- **FR-007** La identidad del tenant y el rol viajan en las credenciales de la sesión (ID token y access token); el tenant nunca se toma del cuerpo de una petición (AGENTS.md §4).
- **FR-008** Toda tabla de negocio lleva el identificador del tenant, y la base de datos impide leer o escribir filas de otro tenant aunque la consulta no filtre.
- **FR-009** Los endpoints nuevos (tenant actual, usuarios del tenant, invitar, desactivar, reactivar, reenviar invitación) se declaran en el contrato de la API antes de implementarse.
- **FR-010** La app muestra el nombre del tenant y, al owner, una pantalla de equipo con usuarios, rol, estado y acciones.
- **FR-011** Cada alta, invitación, desactivación y reactivación queda registrada con quién la hizo y cuándo.

## Entidades clave
- **Tenant**: empresa cliente. Identificador, nombre, plan, estado, fecha de alta.
- **Usuario del tenant**: email, nombre, rol (owner, member), estado (invitado, activo, desactivado), quién lo invitó y cuándo. Uno por email en todo Jano.
- **Registro de actividad de usuarios**: quién hizo qué alta, invitación o cambio de estado, sobre quién y cuándo.

## Criterios de éxito
- **SC-001** Incorporar una empresa nueva con su owner lleva menos de 5 minutos al equipo de Jano y un solo comando.
- **SC-002** Un owner invita a un compañero y este entra en la app en menos de 3 minutos desde que recibe el correo.
- **SC-003** Un member desactivado no completa ninguna acción después de la desactivación (0 peticiones aceptadas).
- **SC-004** En la batería de aislamiento con dos tenants, el 100 % de las lecturas y escrituras cruzadas devuelve cero filas del otro tenant, incluidas las consultas sin filtro.
- **SC-005** Los dos usuarios actuales siguen entrando (contraseña y Google) con el mismo tenant tras la migración.

## Supuestos y dependencias
- Es el primer trozo del backend de la spec 003 (FR-001 y FR-003 de 003: monolito en `backend/`, migraciones versionadas aplicadas fuera del arranque de las Lambdas). La 003 parte de lo que deje esta feature y añade el resto de tablas sobre el mismo esquema multi-tenant.
- El identificador actual `tenant-rumbonorte` se conserva como identificador del tenant piloto; no se reescriben los atributos de los usuarios existentes salvo que el plan lo exija.
- Los correos de invitación los envía el servicio de identidad con su plantilla por defecto en dev; una plantilla con marca Jano y remitente propio queda fuera.
- Cambiar el rol de un usuario (member a owner y al revés) y borrar usuarios se hace por la operación del equipo de Jano; en la app solo invitar, desactivar, reactivar y reenviar.

## Fuera de alcance
Facturación y planes de pago, registro abierto, un schema de base de datos por tenant, usuarios en varios tenants a la vez, SSO corporativo (SAML, Entra ID) y envío de correos a contactos de prospección.

## Decisiones tomadas (Andrés, 2026-10-29)
- **Modelo**: B2B, tenant = empresa con roles owner y member; no se copia el tenant por persona ni el registro abierto de Fenora.
- **Aislamiento**: por fila con `tenant_id`, reforzado en la base de datos además del filtro en el código.
- **Credenciales**: tenant y rol también en el access token, como Fenora.
