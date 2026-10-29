# Evidencia 006 · Inicio de sesión con Google

```
aws secretsmanager create-secret --name jano/dev/google-oauth (copia de fenora/dev/google-oauth, sin imprimir el valor)
node --test infra/modules/cognito/lambda/pre-signup/index.test.mjs  -> tests 7, pass 7, fail 0
terraform apply                                     -> Apply complete! Resources: 6 added, 3 changed, 0 destroyed.
aws cognito-idp describe-identity-provider Google   -> Google, mapping email, email_verified, name, username=sub
aws lambda invoke jano-dev-pre-signup (PreSignUp_ExternalProvider sintético)
  intruso@otra.example                              -> FunctionError Unhandled, errorMessage SIN_ACCESO
  piloto@rumbonorte.example                         -> sin error; identities del piloto = Google 999000111
aws cognito-idp admin-disable-provider-for-user     -> enlace de prueba deshecho; el pool sigue con 1 usuario
pnpm type-check && pnpm build && pnpm test && pnpm lint (jano-app) -> verde; app 7 pass (5 de oauth-retorno)
aws secretsmanager put-secret-value jano/dev/google-oauth (client del proyecto de Google «Jano», desde .credentials/)
terraform apply                                     -> Apply complete! Resources: 0 added, 1 changed, 0 destroyed. (provider_details del IdP)
aws cognito-idp describe-identity-provider Google   -> client_id 37030998588-… (proyecto Jano)
```

Prueba en el navegador (T030, Andrés, 2026-10-29). Los primeros intentos volvieron a `/login?error=sin_acceso`: el log del trigger mostraba que no llegaba `email`, solo `name`, `cognito:email_alias` y `cognito:phone_number_alias`. Causa: el cliente de la app solo podía escribir `name`, y el mapeo de atributos de Google solo escribe lo que el cliente puede escribir. Arreglo: `write_attributes = ["name", "email"]`, como Fenora (`email_verified` no se admite: `InvalidParameterException`), y el cambio de email exige verificar el nuevo.

```
terraform apply (cliente y pool)                    -> Resources: 0 added, 1 changed (dos veces)
log jano-dev-pre-signup                             -> {"msg":"enlazado","proveedor":"Google","destino":"c2c5…"}
aws cognito-idp list-users                          -> 2 usuarios; ramejiafernandez@ con identities Google y tenant-rumbonorte
```
