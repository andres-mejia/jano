import { test } from "node:test";
import assert from "node:assert/strict";

import { claimsDe, handler } from "./index.mjs";

const evento = (attrs) => ({
  version: "2",
  triggerSource: "TokenGeneration_Authentication",
  request: { userAttributes: { email: "piloto@rumbonorte.example", ...attrs } },
  response: { claimsAndScopeOverrideDetails: null },
});

test("añade tenant y rol a los claims del ID token y del access token", async () => {
  const salida = await handler(evento({ "custom:tenant_id": "tenant-rumbonorte", "custom:role": "owner" }));
  const esperado = { "custom:tenant_id": "tenant-rumbonorte", "custom:role": "owner" };
  const { idTokenGeneration, accessTokenGeneration } = salida.response.claimsAndScopeOverrideDetails;
  assert.deepEqual(idTokenGeneration.claimsToAddOrOverride, esperado);
  assert.deepEqual(accessTokenGeneration.claimsToAddOrOverride, esperado);
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
