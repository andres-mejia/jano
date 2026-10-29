import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DEMO_IDS, DemoNoEncontrado, resolverDemo } from "./index";

/**
 * Todas las rutas GET del contrato que usa la app tienen datos de demo (la demo no
 * enseña huecos). Las públicas (`security: []`, como la baja) no las llama la app.
 */
const contrato = readFileSync(new URL("../../../contracts/openapi/jano-api.yaml", import.meta.url), "utf8");
const rutasGet: string[] = [];
let actual: string | null = null;
for (const linea of contrato.split("\n")) {
  const ruta = /^ {2}(\/[^:]+):\s*$/.exec(linea);
  if (ruta?.[1]) actual = ruta[1];
  else if (/^\S/.test(linea)) actual = null;
  else if (actual && /^ {4}get:/.test(linea)) rutasGet.push(actual);
  else if (actual && /^ {6}security: \[\]/.test(linea) && rutasGet.at(-1) === actual) rutasGet.pop();
}

const primero = (o: Record<string, string>): string => Object.values(o)[0] ?? "";
const ejemplo: Record<string, string> = {
  campaignId: DEMO_IDS.campaign,
  prospectId: primero(DEMO_IDS.prospects),
  itemId: primero(DEMO_IDS.inbox),
  stage: "contacted",
};

test("el contrato tiene rutas GET que comprobar", () => {
  assert.ok(rutasGet.length >= 15, `solo ${rutasGet.length} rutas`);
});

for (const ruta of rutasGet) {
  test(`GET ${ruta} tiene datos de demo`, async () => {
    const path = ruta.replace(/\{(\w+)\}/g, (_, p: string) => ejemplo[p] ?? "x");
    const r = await resolverDemo<unknown>("GET", path, undefined, 0);
    assert.ok(r !== undefined && r !== null);
  });
}

test("una ruta fuera del contrato da DemoNoEncontrado", async () => {
  await assert.rejects(resolverDemo("GET", "/no-existe", undefined, 0), DemoNoEncontrado);
});

test("las horas de la demo se trasladan a ahora: los agentes «en vivo» actuaron hace minutos", async () => {
  const d = await resolverDemo<{ agents: { at: string }[]; upcomingMeetings: { start: string }[] }>("GET", "/dashboard/summary", undefined, 0);
  for (const a of d.agents) {
    const hace = Date.now() - Date.parse(a.at);
    assert.ok(hace >= 0 && hace < 20 * 60_000, `agente hace ${Math.round(hace / 60_000)} min`);
  }
  // Las reuniones futuras siguen en el futuro y en hora redonda.
  for (const m of d.upcomingMeetings) {
    assert.ok(Date.parse(m.start) > Date.now());
    assert.match(m.start, /T\d{2}:(00|30):00\.000Z$/);
  }
});
