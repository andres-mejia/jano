import { test } from "node:test";
import assert from "node:assert/strict";

import { crearHandler, normalizarEmail } from "./alta.mjs";

// Almacén y correo en memoria: lo que se prueba es el handler, no el SDK.
function entorno() {
  const items = new Map();
  const contadores = new Map();
  const enviados = [];
  const almacen = {
    async guardarSiNoExiste(item) {
      if (items.has(item.email)) return false;
      items.set(item.email, item);
      return true;
    },
    async contarPeticion(clave) {
      contadores.set(clave, (contadores.get(clave) ?? 0) + 1);
      return contadores.get(clave);
    },
  };
  const correo = { async enviar(m) { enviados.push(m); } };
  const config = { notify: "aviso@rumbonorte.example", siteUrl: "https://jano.tekhos.com", rateLimitPerHour: 5 };
  return { items, enviados, handler: crearHandler({ almacen, correo, config, ahora: () => new Date("2026-10-29T10:00:00Z") }) };
}

const post = (body, ip = "203.0.113.7") => ({
  requestContext: { http: { method: "POST", sourceIp: ip } },
  headers: { "x-jano-source": "landing" },
  body: JSON.stringify(body),
});

test("alta nueva: 201, item en minúsculas, confirmación y aviso", async () => {
  const { items, enviados, handler } = entorno();
  const res = await handler(post({ email: " Lucia@RumboNorte.example ", locale: "es" }));
  assert.equal(res.statusCode, 201);
  const item = items.get("lucia@rumbonorte.example");
  assert.equal(item.partition, "waitlist");
  assert.equal(item.created_at, "2026-10-29T10:00:00.000Z");
  assert.deepEqual(enviados.map((e) => e.to), ["lucia@rumbonorte.example", "aviso@rumbonorte.example"]);
});

test("el mismo email dos veces: 409 y sin reenviar", async () => {
  const { enviados, handler } = entorno();
  await handler(post({ email: "lucia@rumbonorte.example" }));
  const res = await handler(post({ email: "LUCIA@rumbonorte.example" }));
  assert.equal(res.statusCode, 409);
  assert.equal(enviados.length, 2);
});

test("la sexta petición de la misma IP en la hora: 429", async () => {
  const { handler } = entorno();
  for (let i = 0; i < 5; i++) assert.equal((await handler(post({ email: `p${i}@rumbonorte.example` }))).statusCode, 201);
  assert.equal((await handler(post({ email: "p6@rumbonorte.example" }))).statusCode, 429);
  assert.equal((await handler(post({ email: "otra@rumbonorte.example" }, "198.51.100.1"))).statusCode, 201);
});

test("honeypot relleno: 201 sin guardar ni enviar", async () => {
  const { items, enviados, handler } = entorno();
  const res = await handler(post({ email: "bot@spam.example", empresa: "ACME" }));
  assert.equal(res.statusCode, 201);
  assert.equal(items.size, 0);
  assert.equal(enviados.length, 0);
});

test("JSON roto, email inválido y método distinto de POST", async () => {
  const { handler } = entorno();
  assert.equal((await handler({ ...post({}), body: "{" })).statusCode, 400);
  assert.equal((await handler(post({ email: "no-es-email" }))).statusCode, 400);
  assert.equal((await handler({ requestContext: { http: { method: "GET" } } })).statusCode, 405);
});

test("normalizarEmail", () => {
  assert.equal(normalizarEmail("  A@B.example "), "a@b.example");
  assert.equal(normalizarEmail(42), null);
  assert.equal(normalizarEmail("a@b"), null);
});
