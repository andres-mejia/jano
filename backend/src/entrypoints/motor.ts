import { DataApiDb } from "../adapters/data-api-db";
import { ejecutarMotor } from "../application/ejecutar-motor";
import { requerida, serviciosDesdeEntorno } from "./servicios";

/** Lambda `jano-<env>-motor`: la invoca EventBridge Scheduler cada minuto (ADR-003). */
const env = process.env;
const db = new DataApiDb({
  clusterArn: requerida(env, "CLUSTER_ARN"),
  secretArn: requerida(env, "DB_SECRET_ARN"),
  database: requerida(env, "DB_NAME"),
});
const servicios = serviciosDesdeEntorno(env);

export const handler = async (): Promise<void> => {
  const r = await ejecutarMotor(db, servicios);
  console.log(JSON.stringify({ msg: "motor", ...r }));
};
