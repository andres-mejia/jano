// Suspende o reactiva una empresa cliente (spec 007, US5).
//   AWS_PROFILE=fintrack-dev pnpm --filter @jano/backend suspender-tenant --tenant tenant-faro [--reactivar]
import { cambiarSuspension } from "../src/application/operaciones";
import { argumentos, obligatorio } from "./lib/entorno";
import { operar } from "./lib/operacion";

const a = argumentos({ tenant: { type: "string" }, reactivar: { type: "boolean" } });
const tenantId = obligatorio(a.tenant, "tenant");
const suspender = a.reactivar !== true;
const { afectados } = await operar(tenantId, (uow, d) => cambiarSuspension(uow, d, suspender));
console.log(`${tenantId} ${suspender ? "suspendido" : "reactivado"}; ${afectados} usuarios afectados en Cognito`);
