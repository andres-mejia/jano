import { CognitoDirectorio } from "../adapters/cognito-directorio";
import { DataApiDb } from "../adapters/data-api-db";
import { crearManejador } from "../adapters/http";

function requerida(nombre: string): string {
  const v = process.env[nombre];
  if (!v) throw new Error(`falta la variable de entorno ${nombre}`);
  return v;
}

export const handler = crearManejador({
  db: new DataApiDb({
    clusterArn: requerida("CLUSTER_ARN"),
    secretArn: requerida("DB_SECRET_ARN"),
    database: requerida("DB_NAME"),
  }),
  directorio: new CognitoDirectorio(requerida("USER_POOL_ID")),
});
