# Tareas 006 · Inicio de sesión con Google

Convención: `[Tn] [P?] descripción · verificación`.

## Fase 1 · Infra
- [X] T010 Copiar por CLI `fenora/dev/google-oauth` a `jano/dev/google-oauth` (etiquetas `Project=jano`, `Environment=dev`) sin imprimir el valor · `describe-secret` lo devuelve.
- [X] T011 [P] `infra/modules/cognito/lambda/pre-signup/{enlace.mjs,index.mjs,index.test.mjs}` · `node --test` verde: enlaza, rechaza desconocido, email no verificado, deshabilitado y federado, ignora otras fuentes.
- [X] T012 `infra/modules/cognito`: IdP Google, trigger PreSignUp con su rol y log group de 30 d, cliente con Google · `validate` OK.
- [X] T013 `infra/environments/dev`: `data` del secreto con `postcondition`; rol de plan con la excepción del secreto · `test_politica_arranque.py` y `plan` solo con altas y cambios en Cognito.
- [X] T014 `apply` · `describe-identity-provider` devuelve Google.

## Fase 2 · App
- [X] T020 `session.ts`: `signInWithGoogle`, listener OAuth y captura del error del retorno · `pnpm type-check` y tests.
- [X] T021 `/login`: botón «Continuar con Google» y mensaje de rechazo; el layout lleva el error a `/login` · `pnpm build`.

## Fase 3 · Cierre
- [ ] T030 Andrés: redirect URI en Google Cloud Console y prueba en el navegador (alta existente entra con tenant y rol; desconocido no entra) · usuarios del pool antes y después.
- [X] T031 ADR-001 §3 y `docs/guias/despliegue-dev.md` (secreto y redirect URI) · revisión en el PR.
