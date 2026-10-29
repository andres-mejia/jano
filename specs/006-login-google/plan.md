# Plan 006 · Inicio de sesión con Google

**Spec**: `specs/006-login-google/spec.md` · **Rama**: `feat/login-google`

## Resumen
Google como IdP del pool de Jano con la forma de `fintrack/infra/modules/cognito` (endpoints explícitos para evitar el drift que vio Fenora) y un trigger PreSignUp con la forma de `fintrack/infra/modules/auth-triggers/lambda/pre-signup`, pero cerrado: solo enlaza con usuarios existentes y rechaza el resto. La app añade «Continuar con Google» y traduce los errores del retorno de Cognito.

## Contexto técnico
- Credenciales en `jano/<env>/google-oauth` (JSON `client_id`, `client_secret`), creado una vez por CLI copiando `fenora/dev/google-oauth`; Terraform lo lee con `data` y `postcondition`, como Fenora (sin `try()`: si falta, el plan falla en vez de proponer borrar el IdP).
- `aws_cognito_identity_provider` `Google` con `attribute_mapping` de `email`, `email_verified`, `name` y `username = sub`; el cliente pasa a `supported_identity_providers = ["COGNITO", "Google"]`.
- Trigger `jano-<env>-pre-signup` (Node 22, sin dependencias): en `PreSignUp_ExternalProvider` busca por email en minúsculas un usuario no federado y habilitado; si existe y Google verificó el email, `AdminLinkProviderForUser` y deja seguir; si no, lanza `SIN_ACCESO`. Otras fuentes no se tocan. A diferencia de Fenora, falla cerrado: un error de AWS rechaza el acceso.
- Permisos del trigger sobre `userpool/*` de la cuenta y región (el ARN del pool depende del trigger: ciclo).
- Rol de plan de CI: `secretsmanager:GetSecretValue` sigue denegado salvo en `jano/<env>/google-oauth-*`.
- App: `signInWithRedirect({ provider: "Google" })`; `aws-amplify/auth/enable-oauth-listener` al configurar Amplify. El error del retorno (`error_description` en la URL de `/`) se captura antes de configurar Amplify y se lleva a `/login`: `SIN_ACCESO` muestra «Tu cuenta de Google no tiene acceso a Jano. Pide a tu administrador que te dé de alta»; `Already found an entry for username` (primer login tras enlazar) relanza el redirect una vez.

## Puerta de constitución
| Principio | Cumple | Nota |
|---|---|---|
| I · IA decide, motor ejecuta | n/a | Sin agentes |
| II · Contract-first | Sí | No cambia la API |
| III · Misma plataforma que Fenora | Sí | Mismo client de Google y forma de sus módulos; ADR-001 §3 se enmienda en esta feature |
| IV · Cumplimiento | Sí | Sin alta abierta; tests con datos `.example` |
| V · Verificación con evidencia | Sí | Tests del trigger, plan revisado y prueba manual de Andrés en el navegador |

## Riesgos
- La prueba extremo a extremo exige un navegador con una cuenta de Google real: la hace Andrés (T030).
- Si `allow_admin_create_user_only` impidiera el alta federada, el enlace no llegaría a ocurrir: se comprueba en T030 y, si pasa, se documenta y se replantea.
