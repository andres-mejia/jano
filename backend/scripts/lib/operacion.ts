import { CognitoDirectorio } from "../../src/adapters/cognito-directorio";
import { DataApiDb } from "../../src/adapters/data-api-db";
import { ErrorDeNegocio } from "../../src/domain/errores";
import type { UnidadDeTrabajo } from "../../src/ports/db";
import type { Directorio } from "../../src/ports/directorio";
import { entorno } from "./entorno";

/** Ejecuta una operación de `ops` en la transacción de un tenant, con el usuario maestro. */
export async function operar<T>(tenantId: string, fn: (uow: UnidadDeTrabajo, d: Directorio) => Promise<T>): Promise<T> {
  const e = entorno();
  const db = new DataApiDb({ clusterArn: e.clusterArn, secretArn: e.masterSecretArn, database: e.database }, undefined, [
    5000, 5000, 5000, 5000, 5000, 5000,
  ]);
  const directorio = new CognitoDirectorio(e.userPoolId);
  try {
    return await db.enTenant(tenantId, (uow) => fn(uow, directorio));
  } catch (err) {
    if (err instanceof ErrorDeNegocio) {
      console.error(`No se ha hecho nada: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
