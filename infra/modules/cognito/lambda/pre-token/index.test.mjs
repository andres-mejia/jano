import { test } from "node:test";
import assert from "node:assert/strict";

import { claimsDe, handler } from "./index.mjs";

const evento = (attrs) => ({
  triggerSource: "TokenGeneration_Authentication",
  request: { userAttributes: { email: "piloto@rumbonorte.example", ...attrs } },
  response: { claimsOverrideDetails: null },
});

test("añade tenant y rol a los claims del ID token", async () => {
  const salida = await handler(evento({ "custom:tenant_id": "tenant-rumbonorte", "custom:role": "owner" }));
  assert.deepEqual(salida.response.claimsOverrideDetails.claimsToAddOrOverride, {
    "custom:tenant_id": "tenant-rumbonorte",
    "custom:role": "owner",
  });
});

test("sin tenant no hay token", async () => {
  await assert.rejects(handler(evento({ "custom:role": "member" })), /tenant_id/);
});

test("un rol fuera de owner y member no hay token", () => {
  assert.throws(() => claimsDe({ "custom:tenant_id": "t", "custom:role": "admin" }), /role/);
});

test("recorta espacios", () => {
  assert.deepEqual(claimsDe({ "custom:tenant_id": " t1 ", "custom:role": " member " }), {
    "custom:tenant_id": "t1",
    "custom:role": "member",
  });
});
