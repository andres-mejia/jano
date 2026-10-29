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
```

Pendiente (T030, Andrés): URI de redirección en Google Cloud Console y prueba en el navegador.
