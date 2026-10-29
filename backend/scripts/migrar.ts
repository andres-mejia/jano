// Aplica las migraciones pendientes y prepara el rol de la API (spec 007, T010).
//   AWS_PROFILE=fintrack-dev pnpm --filter @jano/backend migrar
//
// El secreto jano/<env>/aurora-api lo crea Terraform vacío: la primera vez se genera
// aquí la contraseña y se guarda; después se reutiliza. En los dos casos se fija en
// el rol, así que secreto y rol nunca divergen.
import { randomBytes } from "node:crypto";

import { GetSecretValueCommand, PutSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

import { ejecutorDataApi, entorno } from "./lib/entorno";
import { migrar, prepararRolApi } from "./lib/migraciones";

const e = entorno();
const ejecutor = ejecutorDataApi(e);
const aplicadas = await migrar(ejecutor);
console.log(aplicadas.length ? `migraciones aplicadas: ${aplicadas.join(", ")}` : "sin migraciones pendientes");

const sm = new SecretsManagerClient({});
let password: string | undefined;
try {
  const actual = await sm.send(new GetSecretValueCommand({ SecretId: e.apiSecretArn }));
  password = (JSON.parse(actual.SecretString ?? "{}") as { password?: string }).password;
} catch (err) {
  if ((err as { name?: string }).name !== "ResourceNotFoundException") throw err;
}
if (!password) {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  password = [...randomBytes(40)].map((b) => alfabeto[b % alfabeto.length]).join("");
  await sm.send(new PutSecretValueCommand({ SecretId: e.apiSecretArn, SecretString: JSON.stringify({ username: "jano_api", password }) }));
  console.log("secreto de jano_api generado");
}
await prepararRolApi(ejecutor, password);
console.log("rol jano_api listo: sin BYPASSRLS y sin tablas propias");
