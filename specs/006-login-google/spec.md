# Feature 006 · Inicio de sesión con Google

**Rama**: `feat/login-google` · **Estado**: especificada · **Fecha**: 2026-10-29 · **Depende de**: 002

## Objetivo
Que un usuario que el administrador ya dio de alta pueda entrar en la app con su cuenta de Google, además de con email y contraseña, sin perder su tenant ni su rol y sin abrir el registro: Jano sigue siendo B2B con alta solo por administrador. Se reutiliza la aplicación OAuth de Google que ya usa Fenora en la misma cuenta.

## Escenarios de usuario

### US1 · Un usuario dado de alta entra con Google (P1)
**Aceptación**
1. Dado un usuario creado por el administrador con email `x@empresa`, tenant y rol, cuando pulsa «Continuar con Google» en `/login` y elige la cuenta de Google `x@empresa`, entra en la app y ve los datos de su tenant.
2. Su sesión lleva el mismo tenant y el mismo rol que si hubiera entrado con contraseña.
3. Después de entrar con Google, puede volver a entrar con su contraseña (si la tiene) y sigue siendo el mismo usuario: un solo usuario por email.

### US2 · Un email que no está dado de alta no entra (P1)
**Aceptación**
1. Dada una cuenta de Google cuyo email no existe en Jano, cuando intenta entrar, no se crea ningún usuario y vuelve a `/login` con un mensaje que dice que su cuenta no tiene acceso y que hable con su administrador.
2. Tras el intento, el número de usuarios de Jano no ha cambiado.

### US3 · El login con contraseña sigue igual (P1)
**Aceptación**
1. Un usuario con contraseña entra exactamente como antes; el botón de Google es una opción más, no un paso obligatorio.

## Casos límite
- El email de Google llega con mayúsculas distintas a las del usuario dado de alta: se trata como el mismo email.
- Google devuelve un email no verificado: no se enlaza ni se entra.
- El usuario cancela en la pantalla de Google: vuelve a `/login` sin error de sistema.
- El usuario dado de alta está deshabilitado: no entra por ninguna vía.
- La cuenta de Google ya estaba enlazada: entra directamente, sin volver a enlazar.

## Requisitos funcionales
- **FR-001** La pantalla `/login` ofrece «Continuar con Google» junto al formulario de email y contraseña.
- **FR-002** Una identidad de Google solo da acceso si su email (sin distinguir mayúsculas) coincide con un usuario existente, habilitado y creado por el administrador; en ese caso queda enlazada a ese usuario y hereda su tenant y su rol.
- **FR-003** Una identidad de Google sin usuario existente se rechaza y no crea usuario (alta solo por administrador, AGENTS.md §4 y spec 002).
- **FR-004** Toda sesión, entre por donde entre, lleva tenant y rol; sin ellos no hay sesión (como en la spec 002).
- **FR-005** Las credenciales de la aplicación OAuth de Google se guardan en un secreto propio de Jano (`jano/dev/google-oauth`), copiado una vez del de Fenora; Jano no lee secretos de Fenora ni se abren excepciones en la política de CI.
- **FR-006** Las credenciales de Google nunca llegan al frontend ni a los logs (AGENTS.md §4).
- **FR-007** El rechazo de US2 se muestra en `/login` con un mensaje comprensible, sin códigos internos.

## Entidades clave
- **Usuario**: el del pool de la spec 002 (email, tenant, rol). Puede tener una identidad de Google enlazada; sigue siendo uno por email.
- **Identidad de Google enlazada**: proveedor y sujeto de Google asociados a un usuario existente.

## Criterios de éxito
- **SC-001** Un usuario piloto dado de alta entra con Google en menos de 30 segundos desde `/login`, y su sesión lleva el mismo tenant y rol que con contraseña.
- **SC-002** Una cuenta de Google no dada de alta no entra en el 100 % de los intentos y el número de usuarios no cambia.
- **SC-003** Tras entrar con Google y con contraseña, el usuario sigue siendo uno solo (un único identificador por email).
- **SC-004** El login con contraseña de la spec 002 sigue funcionando sin cambios.

## Supuestos y dependencias
- Andrés añade, en Google Cloud Console, la URL de retorno de Cognito de Jano al client OAuth de Fenora; sin ese paso Google rechaza el inicio de sesión.
- La pantalla de consentimiento de Google muestra el nombre del proyecto de Fenora. Aceptado en dev; antes de clientes piloto hará falta una aplicación OAuth propia de Jano.
- Si se rota el secreto en Google, hay que actualizar las dos copias (Fenora y Jano).
- Tras cerrar sesión, quien tenga una sola cuenta de Google en el navegador vuelve a entrar sin elegir cuenta (limitación ya documentada en Fenora); se acepta.
- Enmienda ADR-001 §3, que excluía los IdP sociales: Google entra solo como método de acceso de usuarios ya dados de alta.

## Fuera de alcance
Registro abierto con Google, otros proveedores (Apple, Microsoft), passkeys, aplicación OAuth propia de Jano y dominio propio para la página de login.

## Decisiones tomadas (Andrés, 2026-10-29)
- **Credenciales**: copia propia `jano/dev/google-oauth` en vez de leer `fenora/dev/google-oauth`.
- **Acceso**: Google solo enlaza con usuarios existentes (forma del trigger de enlace de Fenora); un email desconocido se rechaza.
