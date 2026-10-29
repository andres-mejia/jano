// Alta de una empresa cliente y de su primer owner (spec 007, US1).
//   AWS_PROFILE=fintrack-dev pnpm --filter @jano/backend alta-tenant \
//     --tenant tenant-faro --nombre "Faro Ingeniería" --owner ana@faro.example [--nombre-owner "Ana"]
import { altaTenant } from "../src/application/operaciones";
import { argumentos, obligatorio } from "./lib/entorno";
import { operar } from "./lib/operacion";

const a = argumentos({
  tenant: { type: "string" },
  nombre: { type: "string" },
  owner: { type: "string" },
  "nombre-owner": { type: "string" },
});
const tenantId = obligatorio(a.tenant, "tenant");
const { ownerId } = await operar(tenantId, (uow, d) =>
  altaTenant(uow, d, {
    tenantId,
    nombre: obligatorio(a.nombre, "nombre"),
    owner: obligatorio(a.owner, "owner"),
    nombreOwner: typeof a["nombre-owner"] === "string" ? a["nombre-owner"] : null,
  }),
);
console.log(`tenant ${tenantId} creado; owner ${ownerId} invitado por correo`);
