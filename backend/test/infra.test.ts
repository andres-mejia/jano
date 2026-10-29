import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { RUTAS, RUTAS_PUBLICAS } from "../src/adapters/http";

/**
 * API Gateway declara cada ruta que sirve el backend (spec 008 T016): las concretas
 * ganan a las comodín de la demo, y solo la baja va sin el autorizador JWT.
 */
const tf = readFileSync(new URL("../../infra/modules/backend-api/main.tf", import.meta.url), "utf8");

function lista(variable: string): string[] {
  const bloque = new RegExp(`variable "${variable}" \\{[\\s\\S]*?default\\s*=\\s*\\[([\\s\\S]*?)\\]`).exec(tf)?.[1] ?? "";
  return [...bloque.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}

test("cada ruta con JWT del backend está en var.routes, y ninguna sobra", () => {
  assert.deepEqual(lista("routes").sort(), Object.keys(RUTAS).sort());
});

test("las rutas públicas son exactamente la baja", () => {
  assert.deepEqual(lista("public_routes"), Object.keys(RUTAS_PUBLICAS));
  assert.deepEqual(Object.keys(RUTAS_PUBLICAS), ["GET /v1/baja/{token}"]);
});
