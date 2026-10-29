import { resolverDemo } from "@jano/demo";

import { CognitoDirectorio } from "../adapters/cognito-directorio";
import { DataApiDb } from "../adapters/data-api-db";
import { crearManejador } from "../adapters/http";
import { requerida, serviciosDesdeEntorno } from "./servicios";

const env = process.env;

export const handler = crearManejador({
  db: new DataApiDb({
    clusterArn: requerida(env, "CLUSTER_ARN"),
    secretArn: requerida(env, "DB_SECRET_ARN"),
    database: requerida(env, "DB_NAME"),
  }),
  directorio: new CognitoDirectorio(requerida(env, "USER_POOL_ID")),
  servicios: serviciosDesdeEntorno(env),
  // DEMO_DATA=on solo en dev: las rutas del contrato que el backend aún no sirve, con datos de ejemplo.
  // DEMO_TENANTS: tenants que ven datos de ejemplo en todo el contrato (la demo comercial).
  ...(env["DEMO_DATA"] === "on"
    ? {
        demo: (m: string, p: string, b: unknown) => resolverDemo(m, p, b, 0),
        tenantsDemo: new Set((env["DEMO_TENANTS"] ?? "").split(",").map((t) => t.trim()).filter(Boolean)),
      }
    : {}),
});
