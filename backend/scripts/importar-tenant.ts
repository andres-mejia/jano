// Lleva a la base de datos un tenant que existía solo en Cognito (spec 007, T022). Idempotente.
//   AWS_PROFILE=fintrack-dev pnpm --filter @jano/backend importar-tenant --tenant tenant-rumbonorte --nombre "Rumbo Norte"
import { importarTenant } from "../src/application/operaciones";
import { argumentos, obligatorio } from "./lib/entorno";
import { operar } from "./lib/operacion";

const a = argumentos({ tenant: { type: "string" }, nombre: { type: "string" } });
const tenantId = obligatorio(a.tenant, "tenant");
const { importados } = await operar(tenantId, (uow, d) => importarTenant(uow, d, { tenantId, nombre: obligatorio(a.nombre, "nombre") }));
console.log(importados.length ? `importados ${importados.length} usuarios en ${tenantId}` : `${tenantId} ya estaba al día`);
